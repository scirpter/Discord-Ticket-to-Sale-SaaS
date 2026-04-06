// @ts-ignore -- package.json now declares p-queue, but this worktree has not refreshed node_modules links.
import PQueue from 'p-queue';
import {
  ChannelType,
  type CategoryChannel,
  type Client,
  type Guild,
  type TextChannel,
} from 'discord.js';
import {
  SportsAccessService,
  SportsDataService,
  SportsLiveEventService,
  SportsService,
  logger,
  resolveSportsLocalDate,
  type SportsChannelBindingSummary,
  type SportsGuildConfigSummary,
  type SportsLiveEvent,
} from '@voodoo/core';

import {
  buildHighlightEmbed,
  buildFinishedLiveEventEmbed,
  buildLiveEventEmbed,
  buildLiveEventHeaderMessage,
} from './ui/sports-embeds.js';

const sportsAccessService = new SportsAccessService();
const sportsDataService = new SportsDataService();
const sportsLiveEventService = new SportsLiveEventService();
const sportsService = new SportsService();

const LIVE_EVENT_QUEUE = new PQueue({
  concurrency: 1,
  intervalCap: 4,
  interval: 1_000,
});
const LIVE_EVENT_CLEANUP_WINDOW_MS = 3 * 60 * 60 * 1000;
const DEFAULT_CATEGORY_NAME = 'Sports Listings';

let liveEventSchedulerTimer: NodeJS.Timeout | null = null;
let liveEventSchedulerInFlight = false;

function normalizeChannelName(base: string): string {
  const normalizedBase = base
    .trim()
    .normalize('NFKD')
    .replace(/[^\w\s-]/gu, '')
    .toLowerCase()
    .replace(/[\s_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 90);

  return normalizedBase || 'sport';
}

function reserveUniqueChannelName(input: {
  base: string;
  usedNames: Set<string>;
  currentName?: string | null;
}): string {
  const normalizedBase = normalizeChannelName(input.base);
  const existingName = input.currentName?.trim().toLowerCase() || null;
  const reservedNames = new Set(input.usedNames);

  if (existingName) {
    reservedNames.delete(existingName);
  }

  let candidate = normalizedBase;
  let suffix = 2;
  while (reservedNames.has(candidate)) {
    const suffixText = `-${suffix}`;
    candidate = `${normalizedBase.slice(0, Math.max(1, 100 - suffixText.length))}${suffixText}`;
    suffix += 1;
  }

  input.usedNames.add(candidate);
  return candidate;
}

function buildManagedChannelTopic(input: {
  timezone: string;
  publishTime: string;
  broadcastCountry: string;
}): string {
  return `Managed by the sports worker. Daily ${input.broadcastCountry} TV listings refresh automatically at ${input.publishTime} (${input.timezone}).`;
}

function buildLiveEventChannelName(eventName: string): string {
  return normalizeChannelName(`live-${eventName}`);
}

function buildLiveEventChannelTopic(eventId: string): string {
  return `Managed by the sports worker for live event ${eventId}.`;
}

function buildLiveEventSnapshots(event: SportsLiveEvent): {
  scoreSnapshot: Record<string, unknown> | null;
  stateSnapshot: Record<string, unknown>;
} {
  return {
    scoreSnapshot: event.scoreLabel ? { scoreLabel: event.scoreLabel } : null,
    stateSnapshot: {
      statusLabel: event.statusLabel,
      broadcasterCount: event.broadcasters.length,
    },
  };
}

function areSnapshotsEqual(
  left: Record<string, unknown> | null,
  right: Record<string, unknown> | null,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isCategoryChannel(channel: unknown): channel is CategoryChannel {
  return typeof channel === 'object' && channel !== null && 'type' in channel && channel.type === ChannelType.GuildCategory;
}

function isManagedTextChannel(channel: unknown): channel is TextChannel {
  return typeof channel === 'object' && channel !== null && 'type' in channel && channel.type === ChannelType.GuildText;
}

function isUnknownChannelError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  if ('code' in error && error.code === 10_003) {
    return true;
  }

  return 'status' in error && error.status === 404;
}

function findAdoptableLiveEventChannel(input: {
  channels: Iterable<unknown>;
  trackedEventChannelIds: Set<string>;
  desiredName: string;
  eventId: string;
  parentIds: Set<string>;
}): TextChannel | null {
  const desiredTopic = buildLiveEventChannelTopic(input.eventId);

  for (const channel of input.channels) {
    if (
      isManagedTextChannel(channel) &&
      channel.name === input.desiredName &&
      channel.topic === desiredTopic &&
      typeof channel.parentId === 'string' &&
      input.parentIds.has(channel.parentId) &&
      !input.trackedEventChannelIds.has(channel.id)
    ) {
      return channel;
    }
  }

  return null;
}

async function clearManagedChannel(channel: TextChannel): Promise<void> {
  while (true) {
    const messages = await channel.messages.fetch({ limit: 100 });
    if (messages.size === 0) {
      return;
    }

    const bulkDeletable = messages.filter((message) => Date.now() - message.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
    if (bulkDeletable.size > 0) {
      await channel.bulkDelete(bulkDeletable, true);
    }

    const oldMessages = messages.filter((message) => !bulkDeletable.has(message.id));
    for (const message of oldMessages.values()) {
      await message.delete().catch(() => null);
    }

    if (messages.size < 100) {
      return;
    }
  }
}

async function getManagedGuildContext(input: {
  guildId: string;
  profileId?: string | null;
}): Promise<{
  config: SportsGuildConfigSummary | null;
  bindings: SportsChannelBindingSummary[];
}> {
  const [configResult, bindingsResult] = await Promise.all([
    sportsService.getGuildConfig({ guildId: input.guildId }),
    sportsService.listChannelBindings({ guildId: input.guildId, profileId: input.profileId }),
  ]);

  if (configResult.isErr()) {
    throw configResult.error;
  }
  if (bindingsResult.isErr()) {
    throw bindingsResult.error;
  }

  return {
    config: configResult.value,
    bindings: bindingsResult.value,
  };
}

async function fetchManagedCategory(
  guild: Guild,
  categoryChannelId: string | null | undefined,
): Promise<CategoryChannel | null> {
  if (!categoryChannelId) {
    return null;
  }

  const category = await guild.channels.fetch(categoryChannelId).catch(() => null);
  return isCategoryChannel(category) ? category : null;
}

async function getAllowedDailyLiveEventIds(input: {
  timezone: string;
  broadcastCountry: string;
  now: Date;
}): Promise<Set<string>> {
  const localDate = resolveSportsLocalDate({
    timezone: input.timezone,
    at: input.now,
  });
  const listingsResult = await sportsDataService.listDailyListingsForLocalDate({
    localDate,
    timezone: input.timezone,
    broadcastCountry: input.broadcastCountry,
  });
  if (listingsResult.isErr()) {
    throw listingsResult.error;
  }

  return new Set(
    listingsResult.value.flatMap((entry) =>
      entry.listings
        .map((listing) => listing.eventId?.trim() ?? '')
        .filter((eventId) => eventId.length > 0),
    ),
  );
}

async function ensureSportChannelForLiveEvent(input: {
  guild: Guild;
  config: SportsGuildConfigSummary;
  listingsCategory: CategoryChannel;
  bindingsBySport: Map<string, SportsChannelBindingSummary>;
  usedNames: Set<string>;
  sportName: string;
  profileId?: string | null;
  broadcastCountry: string;
}): Promise<TextChannel | null> {
  const existingBinding = input.bindingsBySport.get(input.sportName) ?? null;
  if (existingBinding) {
    const existingChannel = await input.guild.channels.fetch(existingBinding.channelId).catch(() => null);
    if (isManagedTextChannel(existingChannel)) {
      return existingChannel;
    }
  }

  const channelName = reserveUniqueChannelName({
    base: input.sportName,
    usedNames: input.usedNames,
  });
  const createdChannel = (await LIVE_EVENT_QUEUE.add(async () =>
    input.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: input.listingsCategory.id,
      topic: buildManagedChannelTopic({
        timezone: input.config.timezone,
        publishTime: input.config.localTimeHhMm,
        broadcastCountry: input.broadcastCountry,
      }),
      reason: `Create the managed ${input.sportName} sport channel for live event publishing.`,
    }),
  )) as TextChannel;

  const bindingResult = await sportsService.upsertChannelBinding({
    guildId: input.guild.id,
    profileId: input.profileId,
    sportId: null,
    sportName: input.sportName,
    sportSlug: createdChannel.name,
    channelId: createdChannel.id,
  });
  if (bindingResult.isErr()) {
    throw bindingResult.error;
  }

  input.bindingsBySport.set(input.sportName, bindingResult.value);
  return createdChannel;
}

async function renderActiveLiveEventChannel(input: {
  channel: TextChannel;
  event: SportsLiveEvent;
}): Promise<void> {
  await LIVE_EVENT_QUEUE.add(async () => {
    await clearManagedChannel(input.channel);
    await input.channel.send({
      content: buildLiveEventHeaderMessage(input.event),
    });
    await input.channel.send({
      embeds: [buildLiveEventEmbed(input.event)],
    });
  });
}

async function renderFinishedLiveEventChannel(input: {
  channel: TextChannel;
  eventName: string;
  sportName: string;
  deleteAfterUtc: string;
  finalScoreLabel?: string | null;
}): Promise<void> {
  await LIVE_EVENT_QUEUE.add(async () => {
    await input.channel.send({
      content: [
        `**${input.eventName}**`,
        input.finalScoreLabel ? `Final score: ${input.finalScoreLabel}` : null,
        `This televised ${input.sportName} event has finished. This temporary channel will be deleted after the cleanup window ends.`,
      ]
        .filter(Boolean)
        .join('\n'),
    });
    await input.channel.send({
      embeds: [
        buildFinishedLiveEventEmbed({
          eventName: input.eventName,
          sportName: input.sportName,
          deleteAfterUtc: input.deleteAfterUtc,
        }),
      ],
    });
  });
}

async function postLiveEventHighlightsIfAvailable(input: {
  guildId: string;
  profileId?: string | null;
  trackedEvent: {
    eventId: string;
    eventName: string;
    sportName: string;
    highlightsPosted: boolean;
  };
  channel: TextChannel;
  now: Date;
}): Promise<boolean> {
  if (input.trackedEvent.highlightsPosted) {
    return false;
  }

  const highlightResult = await sportsDataService.getEventHighlights({
    eventId: input.trackedEvent.eventId,
  });
  if (highlightResult.isErr()) {
    logger.warn(
      {
        guildId: input.guildId,
        eventId: input.trackedEvent.eventId,
        err: highlightResult.error,
      },
      'live event runtime could not load event highlights',
    );
    return false;
  }
  const highlight = highlightResult.value;
  if (!highlight) {
    return false;
  }

  const markHighlightsPostedResult = await sportsLiveEventService.markHighlightsPosted({
    guildId: input.guildId,
    profileId: input.profileId,
    eventId: input.trackedEvent.eventId,
    postedAtUtc: input.now,
  });
  if (markHighlightsPostedResult.isErr()) {
    logger.warn(
      {
        guildId: input.guildId,
        eventId: input.trackedEvent.eventId,
        err: markHighlightsPostedResult.error,
      },
      'live event runtime could not persist highlight delivery',
    );
    return false;
  }
  if (!markHighlightsPostedResult.value.claimed) {
    return false;
  }

  try {
    await LIVE_EVENT_QUEUE.add(async () => {
      await input.channel.send({
        content: `Highlights are now available for **${input.trackedEvent.eventName}**.`,
        embeds: [
          buildHighlightEmbed({
            eventName: input.trackedEvent.eventName,
            sportName: input.trackedEvent.sportName,
            highlight,
          }),
        ],
      });
    });
  } catch (error) {
    const releaseHighlightClaimResult = await sportsLiveEventService.releaseHighlightClaim({
      guildId: input.guildId,
      profileId: input.profileId,
      eventId: input.trackedEvent.eventId,
      releasedAtUtc: input.now,
    });
    if (releaseHighlightClaimResult.isErr()) {
      logger.warn(
        {
          guildId: input.guildId,
          eventId: input.trackedEvent.eventId,
          err: releaseHighlightClaimResult.error,
        },
        'live event runtime could not release the reserved highlight claim after send failure',
      );
    }

    logger.warn(
      {
        guildId: input.guildId,
        eventId: input.trackedEvent.eventId,
        errorMessage: error instanceof Error ? error.message : 'unknown',
      },
      'live event runtime could not send reserved event highlights',
    );
    return false;
  }

  return true;
}

async function fetchTrackedEventChannel(
  guild: Guild,
  eventChannelId: string | null,
): Promise<TextChannel | null> {
  const channelLookup = await fetchTrackedEventChannelState(guild, eventChannelId);
  return channelLookup.status === 'found' ? channelLookup.channel : null;
}

type TrackedEventChannelState =
  | { status: 'found'; channel: TextChannel }
  | { status: 'missing' }
  | { status: 'error'; error: unknown };

async function fetchTrackedEventChannelState(
  guild: Guild,
  eventChannelId: string | null,
): Promise<TrackedEventChannelState> {
  if (!eventChannelId) {
    return { status: 'missing' };
  }

  try {
    const channel = await guild.channels.fetch(eventChannelId);
    return isManagedTextChannel(channel) ? { status: 'found', channel } : { status: 'missing' };
  } catch (error) {
    if (isUnknownChannelError(error)) {
      return { status: 'missing' };
    }

    return { status: 'error', error };
  }
}

async function cleanupTrackedEventIfDue(input: {
  guild: Guild;
  trackedEvent: SportsLiveEventChannelSummaryLike;
  now: Date;
}): Promise<boolean> {
  if (!input.trackedEvent.deleteAfterUtc) {
    return false;
  }

  const cleanupAt = input.trackedEvent.deleteAfterUtc;
  if (Number.isNaN(cleanupAt.getTime()) || cleanupAt > input.now) {
    return false;
  }

  const channel = await fetchTrackedEventChannel(input.guild, input.trackedEvent.eventChannelId);
  if (channel) {
    await LIVE_EVENT_QUEUE.add(() =>
      channel.delete(`Delete the finished live event channel for ${input.trackedEvent.eventName}.`),
    );
  }

  const markDeletedResult = await sportsLiveEventService.markDeleted({
    guildId: input.guild.id,
    profileId: input.trackedEvent.profileId,
    eventId: input.trackedEvent.eventId,
    deletedAtUtc: input.now,
  });
  if (markDeletedResult.isErr()) {
    throw markDeletedResult.error;
  }

  return true;
}

type SportsLiveEventChannelSummaryLike = {
  profileId: string;
  eventId: string;
  eventName: string;
  sportName: string;
  eventChannelId: string | null;
  status: 'scheduled' | 'live' | 'finished' | 'cleanup_due' | 'deleted' | 'failed';
  deleteAfterUtc: Date | null;
  highlightsPosted: boolean;
};

export async function resumeTrackedLiveEventsForGuild(input: {
  guild: Guild;
  now?: Date;
}): Promise<{
  deletedChannelCount: number;
  failedEventCount: number;
  highlightsPostedCount: number;
}> {
  const now = input.now ?? new Date();
  const recoverableEventsResult = await sportsLiveEventService.listRecoverableEvents({
    guildId: input.guild.id,
  });
  if (recoverableEventsResult.isErr()) {
    throw recoverableEventsResult.error;
  }

  let deletedChannelCount = 0;
  let failedEventCount = 0;
  let highlightsPostedCount = 0;

  for (const trackedEvent of recoverableEventsResult.value) {
    const channelLookup = await fetchTrackedEventChannelState(input.guild, trackedEvent.eventChannelId);
    if (channelLookup.status === 'error') {
      logger.warn(
        {
          guildId: input.guild.id,
          eventId: trackedEvent.eventId,
          eventChannelId: trackedEvent.eventChannelId,
          errorMessage:
            channelLookup.error instanceof Error ? channelLookup.error.message : 'unknown',
        },
        'live event runtime could not recover the tracked event channel because fetching it failed',
      );
      continue;
    }
    if (channelLookup.status === 'missing') {
      const markFailedResult = await sportsLiveEventService.markFailed({
        guildId: input.guild.id,
        profileId: trackedEvent.profileId,
        eventId: trackedEvent.eventId,
        failedAtUtc: now,
      });
      if (markFailedResult.isErr()) {
        logger.warn(
          { guildId: input.guild.id, eventId: trackedEvent.eventId, err: markFailedResult.error },
          'live event runtime could not mark the tracked event as failed during recovery',
        );
      } else {
        failedEventCount += 1;
      }

      logger.warn(
        { guildId: input.guild.id, eventId: trackedEvent.eventId, eventChannelId: trackedEvent.eventChannelId },
        'live event runtime could not recover the tracked event channel because it is missing',
      );
      continue;
    }
    const channel = channelLookup.channel;

    if (trackedEvent.status === 'cleanup_due') {
      const deleted = await cleanupTrackedEventIfDue({
        guild: input.guild,
        trackedEvent,
        now,
      });
      if (deleted) {
        deletedChannelCount += 1;
        continue;
      }

      const postedHighlights = await postLiveEventHighlightsIfAvailable({
        guildId: input.guild.id,
        profileId: trackedEvent.profileId,
        trackedEvent,
        channel,
        now,
      });
      if (postedHighlights) {
        highlightsPostedCount += 1;
      }
    }
  }

  return {
    deletedChannelCount,
    failedEventCount,
    highlightsPostedCount,
  };
}

export async function reconcileLiveEventsForGuild(input: {
  guild: Guild;
  timezone: string;
  broadcastCountry: string;
  profile?: {
    profileId: string;
    label: string;
    dailyCategoryChannelId: string | null;
    liveCategoryChannelId: string | null;
  };
  now?: Date;
}): Promise<{
  createdChannelCount: number;
  updatedChannelCount: number;
  markedFinishedCount: number;
}> {
  const now = input.now ?? new Date();
  const { config, bindings } = await getManagedGuildContext({
    guildId: input.guild.id,
    profileId: input.profile?.profileId,
  });
  if (!config) {
    return {
      createdChannelCount: 0,
      updatedChannelCount: 0,
      markedFinishedCount: 0,
    };
  }

  const listingsCategory = await fetchManagedCategory(
    input.guild,
    input.profile?.dailyCategoryChannelId ?? config.managedCategoryChannelId,
  );
  if (!listingsCategory) {
    return {
      createdChannelCount: 0,
      updatedChannelCount: 0,
      markedFinishedCount: 0,
    };
  }
  const liveCategory = await fetchManagedCategory(
    input.guild,
    input.profile?.liveCategoryChannelId ?? config.liveCategoryChannelId ?? null,
  );

  const liveEventsResult = await sportsDataService.listLiveEvents({
    timezone: input.timezone,
    broadcastCountry: input.broadcastCountry,
  });
  if (liveEventsResult.isErr()) {
    throw liveEventsResult.error;
  }
  const allowedDailyEventIds = await getAllowedDailyLiveEventIds({
    timezone: input.timezone,
    broadcastCountry: input.broadcastCountry,
    now,
  });
  const trackedEventsResult = await sportsLiveEventService.listTrackedEvents({
    guildId: input.guild.id,
    profileId: input.profile?.profileId,
  });
  if (trackedEventsResult.isErr()) {
    throw trackedEventsResult.error;
  }

  const televisedLiveEvents = liveEventsResult.value.filter(
    (event) =>
      typeof event.sportName === 'string' &&
      event.sportName.trim().length > 0 &&
      allowedDailyEventIds.has(event.eventId),
  );
  const trackedEventsByEventId = new Map(
    trackedEventsResult.value.map((trackedEvent) => [trackedEvent.eventId, trackedEvent]),
  );
  const trackedEventChannelIds = new Set(
    trackedEventsResult.value.flatMap((trackedEvent) =>
      trackedEvent.eventChannelId ? [trackedEvent.eventChannelId] : [],
    ),
  );
  const bindingsBySport = new Map(bindings.map((binding) => [binding.sportName, binding]));
  const guildChannels = await input.guild.channels.fetch();
  const usedNames = new Set(
    [...guildChannels.values()]
      .filter((channel): channel is NonNullable<typeof channel> => channel !== null)
      .map((channel) => channel.name),
  );

  let createdChannelCount = 0;
  let updatedChannelCount = 0;
  let markedFinishedCount = 0;

  for (const event of televisedLiveEvents) {
    const sportName = event.sportName ?? DEFAULT_CATEGORY_NAME;
    const trackedEvent = trackedEventsByEventId.get(event.eventId) ?? null;
    const existingChannel = await fetchTrackedEventChannel(input.guild, trackedEvent?.eventChannelId ?? null);
    if (!liveCategory) {
      continue;
    }

    const sportChannel = await ensureSportChannelForLiveEvent({
      guild: input.guild,
      config,
      listingsCategory,
      bindingsBySport,
      usedNames,
      sportName,
      profileId: input.profile?.profileId,
      broadcastCountry: input.broadcastCountry,
    });
    if (!sportChannel) {
      continue;
    }
    const desiredName = buildLiveEventChannelName(event.eventName);
    const desiredTopic = buildLiveEventChannelTopic(event.eventId);
    const adoptedChannel = existingChannel
      ? null
      : findAdoptableLiveEventChannel({
          channels: guildChannels.values(),
          trackedEventChannelIds,
          desiredName,
          eventId: event.eventId,
          parentIds: liveCategory ? new Set([liveCategory.id]) : new Set<string>(),
        });
    const desiredExistingName = existingChannel
      ? reserveUniqueChannelName({
          base: desiredName,
          usedNames: new Set(usedNames),
          currentName: existingChannel.name,
        })
      : desiredName;
    const desiredSnapshots = buildLiveEventSnapshots(event);
    const isPlacementUnchanged =
      existingChannel?.name === desiredExistingName &&
      existingChannel.topic === desiredTopic &&
      (liveCategory ? (existingChannel.parentId ?? null) === liveCategory.id : true);
    const isTrackedStateUnchanged =
      trackedEvent?.status === 'live' &&
      trackedEvent.eventChannelId === existingChannel?.id &&
      areSnapshotsEqual(trackedEvent.lastScoreSnapshot, desiredSnapshots.scoreSnapshot) &&
      areSnapshotsEqual(trackedEvent.lastStateSnapshot, desiredSnapshots.stateSnapshot);

    if (existingChannel && isPlacementUnchanged && isTrackedStateUnchanged) {
      const heartbeatResult = await sportsLiveEventService.upsertTrackedEvent({
        guildId: input.guild.id,
        profileId: input.profile?.profileId,
        sportName,
        eventId: event.eventId,
        eventName: event.eventName,
        sportChannelId: sportChannel.id,
        kickoffAtUtc: trackedEvent?.kickoffAtUtc ?? now,
        eventChannelId: existingChannel.id,
        status: 'live',
        lastScoreSnapshot: desiredSnapshots.scoreSnapshot,
        lastStateSnapshot: desiredSnapshots.stateSnapshot,
        lastSyncedAtUtc: now,
        finishedAtUtc: null,
        deleteAfterUtc: null,
        highlightsPosted: trackedEvent?.highlightsPosted ?? false,
      });
      if (heartbeatResult.isErr()) {
        throw heartbeatResult.error;
      }
      continue;
    }

    let targetChannel: TextChannel;
    if (existingChannel) {
      const reservedName = reserveUniqueChannelName({
        base: desiredName,
        usedNames,
        currentName: existingChannel.name,
      });
      await LIVE_EVENT_QUEUE.add(async () =>
        existingChannel.edit(
          liveCategory
            ? {
                name: reservedName,
                parent: liveCategory.id,
                topic: desiredTopic,
              }
            : {
                name: reservedName,
                topic: desiredTopic,
              },
        ),
      );
      updatedChannelCount += 1;
      targetChannel = existingChannel;
    } else if (adoptedChannel) {
      trackedEventChannelIds.add(adoptedChannel.id);
      targetChannel = adoptedChannel;
    } else {
      const reservedName = reserveUniqueChannelName({
        base: desiredName,
        usedNames,
      });
      targetChannel = (await LIVE_EVENT_QUEUE.add(async () =>
        input.guild.channels.create({
          name: reservedName,
          type: ChannelType.GuildText,
          parent: liveCategory?.id,
          topic: desiredTopic,
          reason: `Create a temporary live event channel for ${event.eventName}.`,
        }),
      )) as TextChannel;
      trackedEventChannelIds.add(targetChannel.id);
      createdChannelCount += 1;
    }

    await renderActiveLiveEventChannel({
      channel: targetChannel,
      event,
    });

    const persistedTrackedEvent = await sportsLiveEventService.upsertTrackedEvent({
      guildId: input.guild.id,
      profileId: input.profile?.profileId,
      sportName,
      eventId: event.eventId,
      eventName: event.eventName,
      sportChannelId: sportChannel.id,
      kickoffAtUtc: trackedEvent?.kickoffAtUtc ?? now,
      eventChannelId: targetChannel.id,
      status: 'live',
      lastScoreSnapshot: desiredSnapshots.scoreSnapshot,
      lastStateSnapshot: desiredSnapshots.stateSnapshot,
      lastSyncedAtUtc: now,
      finishedAtUtc: null,
      deleteAfterUtc: null,
      highlightsPosted: trackedEvent?.highlightsPosted ?? false,
    });
    if (persistedTrackedEvent.isErr()) {
      throw persistedTrackedEvent.error;
    }
  }

  const liveEventIds = new Set(televisedLiveEvents.map((event) => event.eventId));
  for (const trackedEvent of trackedEventsResult.value) {
    if (
      liveEventIds.has(trackedEvent.eventId) ||
      trackedEvent.status === 'cleanup_due' ||
      trackedEvent.status === 'deleted' ||
      trackedEvent.status === 'failed'
    ) {
      continue;
    }

    const finishedResult = await sportsLiveEventService.markFinished({
      guildId: input.guild.id,
      profileId: input.profile?.profileId,
      eventId: trackedEvent.eventId,
      finishedAtUtc: now,
    });
    if (finishedResult.isErr()) {
      logger.warn(
        { guildId: input.guild.id, eventId: trackedEvent.eventId, err: finishedResult.error },
        'live event runtime could not mark the tracked event as finished',
      );
      continue;
    }
    const eventChannel = await fetchTrackedEventChannel(input.guild, trackedEvent.eventChannelId);
    const deleteAfterUtc =
      finishedResult.value.deleteAfterUtc?.toISOString() ??
      new Date(now.getTime() + LIVE_EVENT_CLEANUP_WINDOW_MS).toISOString();

    if (eventChannel) {
      await renderFinishedLiveEventChannel({
        channel: eventChannel,
        eventName: trackedEvent.eventName,
        sportName: trackedEvent.sportName,
        deleteAfterUtc,
        finalScoreLabel:
          typeof finishedResult.value.lastScoreSnapshot?.scoreLabel === 'string'
            ? finishedResult.value.lastScoreSnapshot.scoreLabel
            : null,
      });
      await postLiveEventHighlightsIfAvailable({
        guildId: input.guild.id,
        profileId: input.profile?.profileId,
        trackedEvent: finishedResult.value,
        channel: eventChannel,
        now,
      });
    }
    markedFinishedCount += 1;
  }

  for (const trackedEvent of trackedEventsResult.value) {
    if (trackedEvent.status !== 'cleanup_due' || trackedEvent.highlightsPosted) {
      continue;
    }

    const eventChannel = await fetchTrackedEventChannel(input.guild, trackedEvent.eventChannelId);
    if (!eventChannel) {
      continue;
    }

    await postLiveEventHighlightsIfAvailable({
      guildId: input.guild.id,
      profileId: trackedEvent.profileId,
      trackedEvent,
      channel: eventChannel,
      now,
    });
  }

  return {
    createdChannelCount,
    updatedChannelCount,
    markedFinishedCount,
  };
}

export async function runPendingLiveEventCleanup(input: {
  guild: Guild;
  now?: Date;
}): Promise<{ deletedChannelCount: number }> {
  const now = input.now ?? new Date();
  const trackedEventsResult = await sportsLiveEventService.listTrackedEvents({
    guildId: input.guild.id,
    statuses: ['cleanup_due'],
  });
  if (trackedEventsResult.isErr()) {
    throw trackedEventsResult.error;
  }
  let deletedChannelCount = 0;

  for (const trackedEvent of trackedEventsResult.value) {
    if (!trackedEvent.deleteAfterUtc) {
      continue;
    }

    const cleanupAt = trackedEvent.deleteAfterUtc;
    if (Number.isNaN(cleanupAt.getTime()) || cleanupAt > now) {
      continue;
    }

    const channel = await fetchTrackedEventChannel(input.guild, trackedEvent.eventChannelId);
    if (channel) {
      await LIVE_EVENT_QUEUE.add(() =>
        channel.delete(`Delete the finished live event channel for ${trackedEvent.eventName}.`),
      );
    }
    const markDeletedResult = await sportsLiveEventService.markDeleted({
      guildId: input.guild.id,
      profileId: trackedEvent.profileId,
      eventId: trackedEvent.eventId,
      deletedAtUtc: now,
    });
    if (markDeletedResult.isErr()) {
      throw markDeletedResult.error;
    }
    deletedChannelCount += 1;
  }

  return { deletedChannelCount };
}

async function runLiveEventScheduler(client: Client): Promise<void> {
  const guilds = await client.guilds.fetch();

  for (const guildPreview of guilds.values()) {
    try {
      const activationState = await sportsAccessService.getGuildActivationState({
        guildId: guildPreview.id,
      });
      if (activationState.isErr()) {
        throw activationState.error;
      }
      if (!activationState.value.activated) {
        continue;
      }

      const configResult = await sportsService.getGuildConfig({ guildId: guildPreview.id });
      if (configResult.isErr()) {
        throw configResult.error;
      }
      if (!configResult.value) {
        continue;
      }

      const profilesResult = await sportsService.listProfiles({ guildId: guildPreview.id });
      if (profilesResult.isErr()) {
        throw profilesResult.error;
      }

      const guild = await client.guilds.fetch(guildPreview.id);
      const enabledProfiles = profilesResult.value.filter((profile) => profile.enabled);
      if (enabledProfiles.length === 0) {
        await reconcileLiveEventsForGuild({
          guild,
          timezone: configResult.value.timezone,
          broadcastCountry: configResult.value.broadcastCountry,
        });
      } else {
        for (const profile of enabledProfiles) {
          await reconcileLiveEventsForGuild({
            guild,
            timezone: configResult.value.timezone,
            broadcastCountry: profile.broadcastCountry,
            profile: {
              profileId: profile.profileId,
              label: profile.label,
              dailyCategoryChannelId: profile.dailyCategoryChannelId,
              liveCategoryChannelId: profile.liveCategoryChannelId,
            },
          });
        }
      }
      await runPendingLiveEventCleanup({ guild });
    } catch (error) {
      logger.warn(
        {
          guildId: guildPreview.id,
          errorMessage: error instanceof Error ? error.message : 'unknown',
        },
        'live event scheduler tick failed',
      );
    }
  }
}

async function runLiveEventStartupRecovery(client: Client): Promise<void> {
  const guilds = await client.guilds.fetch();

  for (const guildPreview of guilds.values()) {
    try {
      const activationState = await sportsAccessService.getGuildActivationState({
        guildId: guildPreview.id,
      });
      if (activationState.isErr()) {
        throw activationState.error;
      }
      if (!activationState.value.activated) {
        continue;
      }

      const configResult = await sportsService.getGuildConfig({ guildId: guildPreview.id });
      if (configResult.isErr()) {
        throw configResult.error;
      }
      if (!configResult.value) {
        continue;
      }

      const guild = await client.guilds.fetch(guildPreview.id);
      await resumeTrackedLiveEventsForGuild({ guild });
    } catch (error) {
      logger.warn(
        {
          guildId: guildPreview.id,
          errorMessage: error instanceof Error ? error.message : 'unknown',
        },
        'live event scheduler tick failed',
      );
    }
  }
}

function queueLiveEventSchedulerTick(client: Client): void {
  if (liveEventSchedulerInFlight) {
    return;
  }

  liveEventSchedulerInFlight = true;
  void runLiveEventScheduler(client).finally(() => {
    liveEventSchedulerInFlight = false;
  });
}

function queueLiveEventSchedulerStartup(client: Client): void {
  if (liveEventSchedulerInFlight) {
    return;
  }

  liveEventSchedulerInFlight = true;
  void runLiveEventStartupRecovery(client)
    .then(async () => {
      await runLiveEventScheduler(client);
    })
    .finally(() => {
      liveEventSchedulerInFlight = false;
    });
}

export function startLiveEventScheduler(client: Client, pollIntervalMs: number): void {
  if (liveEventSchedulerTimer) {
    return;
  }

  const effectivePollIntervalMs = Math.max(5_000, Math.floor(pollIntervalMs));
  queueLiveEventSchedulerStartup(client);
  liveEventSchedulerTimer = setInterval(() => {
    queueLiveEventSchedulerTick(client);
  }, effectivePollIntervalMs);
  liveEventSchedulerTimer.unref?.();
}

export function stopLiveEventScheduler(): void {
  if (!liveEventSchedulerTimer) {
    return;
  }

  clearInterval(liveEventSchedulerTimer);
  liveEventSchedulerTimer = null;
  liveEventSchedulerInFlight = false;
}
