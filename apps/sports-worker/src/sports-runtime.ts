import {
  AppError,
  getEnv,
  logger,
  resolveSportsLocalDate,
  SportsAccessService,
  SportsDataService,
  SportsService,
  type SportDefinition,
  type SportsChannelBindingSummary,
  type SportsGuildConfigSummary,
  type SportsListing,
} from '@voodoo/core';
import { ChannelType, type CategoryChannel, type Client, type Guild, type TextChannel } from 'discord.js';

import {
  buildSportEventEmbed,
  formatBroadcastCountriesLabel,
  buildSportHeaderMessage,
} from './ui/sports-embeds.js';

const env = getEnv();
const sportsService = new SportsService();
const sportsDataService = new SportsDataService();
const sportsAccessService = new SportsAccessService();

const DEFAULT_CATEGORY_NAME = 'Sports Listings';
const DEFAULT_SHARED_BROADCAST_COUNTRIES = ['United Kingdom', 'United States'];
const RETRY_DELAY_MS = 15 * 60 * 1000;
const MANAGED_CHANNEL_TOPIC_PREFIX = 'Managed by the sports worker.';

let schedulerTimer: NodeJS.Timeout | null = null;
let schedulerTickInFlight = false;

function buildManagedChannelTopic(input: {
  timezone: string;
  publishTime: string;
  broadcastCountries: string[];
  degraded?: boolean;
  failedCountries?: string[];
}): string {
  const countriesLabel = formatBroadcastCountriesLabel(input.broadcastCountries);
  const failedCountriesLabel =
    input.degraded && input.failedCountries && input.failedCountries.length > 0
      ? formatBroadcastCountriesLabel(input.failedCountries)
      : null;

  if (failedCountriesLabel) {
    return `${MANAGED_CHANNEL_TOPIC_PREFIX} Daily TV listings currently reflect tracked broadcasters in ${countriesLabel}. Coverage is degraded because data is unavailable for ${failedCountriesLabel}. Refreshes automatically at ${input.publishTime} (${input.timezone}).`;
  }

  return `${MANAGED_CHANNEL_TOPIC_PREFIX} Daily TV listings for tracked broadcasters in ${countriesLabel} refresh automatically at ${input.publishTime} (${input.timezone}).`;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

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
  let candidate = normalizedBase;
  let suffix = 2;
  const reservedNames = new Set(input.usedNames);

  if (existingName) {
    reservedNames.delete(existingName);
  }

  while (reservedNames.has(candidate)) {
    const suffixText = `-${suffix}`;
    candidate = `${normalizedBase.slice(0, Math.max(1, 100 - suffixText.length))}${suffixText}`;
    suffix += 1;
  }

  input.usedNames.add(candidate);
  return candidate;
}

function isCategoryChannel(channel: unknown): channel is CategoryChannel {
  return typeof channel === 'object' && channel !== null && 'type' in channel && channel.type === ChannelType.GuildCategory;
}

function isManagedTextChannel(channel: unknown): channel is TextChannel {
  return typeof channel === 'object' && channel !== null && 'type' in channel && channel.type === ChannelType.GuildText;
}

function hasManagedChannelTopic(topic: string | null | undefined): boolean {
  return typeof topic === 'string' && topic.startsWith(MANAGED_CHANNEL_TOPIC_PREFIX);
}

function isNumericSlugSuffix(value: string): boolean {
  return /-\d+$/u.test(value);
}

function scoreBindingForCanonicalSelection(binding: SportsChannelBindingSummary, sportName: string): number {
  const normalizedSportSlug = normalizeChannelName(sportName);
  let score = 0;

  if (binding.sportSlug === normalizedSportSlug) {
    score += 100;
  }

  if (!isNumericSlugSuffix(binding.sportSlug)) {
    score += 10;
  }

  score -= binding.sportSlug.length;
  return score;
}

function partitionBindingsByCanonical(input: {
  bindings: SportsChannelBindingSummary[];
}): {
  canonicalBindings: SportsChannelBindingSummary[];
  duplicateBindings: SportsChannelBindingSummary[];
} {
  const bindingsBySport = new Map<string, SportsChannelBindingSummary[]>();

  for (const binding of input.bindings) {
    const current = bindingsBySport.get(binding.sportName) ?? [];
    current.push(binding);
    bindingsBySport.set(binding.sportName, current);
  }

  const canonicalBindings: SportsChannelBindingSummary[] = [];
  const duplicateBindings: SportsChannelBindingSummary[] = [];

  for (const [sportName, bindings] of bindingsBySport) {
    const rankedBindings = [...bindings].sort((left, right) => {
      const scoreDifference =
        scoreBindingForCanonicalSelection(right, sportName) -
        scoreBindingForCanonicalSelection(left, sportName);
      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return left.bindingId.localeCompare(right.bindingId);
    });

    const canonicalBinding = rankedBindings.shift();
    if (!canonicalBinding) {
      continue;
    }

    canonicalBindings.push(canonicalBinding);
    duplicateBindings.push(...rankedBindings);
  }

  return { canonicalBindings, duplicateBindings };
}

async function deleteManagedChannel(channel: TextChannel, reason: string): Promise<void> {
  await channel.delete(reason).catch((error) => {
    logger.warn(
      {
        err: error instanceof Error ? error : new Error(String(error)),
        channelId: channel.id,
      },
      'sports worker could not delete managed channel',
    );
  });
}

async function reconcileDuplicateBindings(input: {
  guild: Guild;
  category: CategoryChannel;
  bindings: SportsChannelBindingSummary[];
}): Promise<{
  bindings: SportsChannelBindingSummary[];
  removedChannelIds: Set<string>;
}> {
  const { canonicalBindings, duplicateBindings } = partitionBindingsByCanonical({
    bindings: input.bindings,
  });
  const removedChannelIds = new Set<string>();

  for (const duplicateBinding of duplicateBindings) {
    const channel = await input.guild.channels.fetch(duplicateBinding.channelId).catch(() => null);
    if (
      isManagedTextChannel(channel) &&
      channel.parentId === input.category.id &&
      hasManagedChannelTopic(channel.topic)
    ) {
      removedChannelIds.add(channel.id);
      await deleteManagedChannel(
        channel,
        'Removing duplicate sports worker managed channel.',
      );
    }

    const deleteBindingResult = await sportsService.deleteChannelBinding({
      bindingId: duplicateBinding.bindingId,
    });
    if (deleteBindingResult.isErr()) {
      throw deleteBindingResult.error;
    }
  }

  return {
    bindings: canonicalBindings,
    removedChannelIds,
  };
}

async function removeOrphanedManagedChannels(input: {
  guild: Guild;
  category: CategoryChannel;
  activeChannelIds: Set<string>;
  removedChannelIds?: Set<string>;
}): Promise<void> {
  const fetchedChannels = await input.guild.channels.fetch();

  for (const channel of fetchedChannels.values()) {
    if (!isManagedTextChannel(channel)) {
      continue;
    }

    if (channel.parentId !== input.category.id) {
      continue;
    }

    if (!hasManagedChannelTopic(channel.topic)) {
      continue;
    }

    if (input.activeChannelIds.has(channel.id) || input.removedChannelIds?.has(channel.id)) {
      continue;
    }

    await deleteManagedChannel(channel, 'Removing orphaned sports worker managed channel.');
  }
}

async function ensureManagedCategory(input: {
  guild: Guild;
  existingCategoryChannelId: string | null | undefined;
  categoryName: string | null;
}): Promise<CategoryChannel> {
  const desiredName = input.categoryName?.trim() || DEFAULT_CATEGORY_NAME;

  if (input.existingCategoryChannelId) {
    const existing = await input.guild.channels.fetch(input.existingCategoryChannelId).catch(() => null);
    if (isCategoryChannel(existing)) {
      if (existing.name !== desiredName) {
        await existing.setName(desiredName);
      }
      return existing;
    }
  }

  const created = await input.guild.channels.create({
    name: desiredName,
    type: ChannelType.GuildCategory,
  });

  return created;
}

async function ensureOptionalManagedCategory(input: {
  guild: Guild;
  existingCategoryChannelId: string | null | undefined;
  categoryName: string | null;
}): Promise<CategoryChannel | null> {
  if (input.categoryName?.trim()) {
    return ensureManagedCategory(input);
  }

  if (!input.existingCategoryChannelId) {
    return null;
  }

  const existing = await input.guild.channels.fetch(input.existingCategoryChannelId).catch(() => null);
  return isCategoryChannel(existing) ? existing : null;
}

async function ensureManagedTextChannel(input: {
  guild: Guild;
  category: CategoryChannel;
  binding: SportsChannelBindingSummary | null;
  sport: Pick<SportDefinition, 'sportId' | 'sportName' | 'channelSlug'>;
  config: SportsGuildConfigSummary;
  usedNames: Set<string>;
  topicBroadcastCountries?: string[];
  topicDegraded?: boolean;
  topicFailedCountries?: string[];
}): Promise<{ channel: TextChannel; created: boolean }> {
  const desiredTopic = buildManagedChannelTopic({
    timezone: input.config.timezone,
    publishTime: input.config.localTimeHhMm,
    broadcastCountries: input.topicBroadcastCountries ?? input.config.broadcastCountries,
    degraded: input.topicDegraded,
    failedCountries: input.topicFailedCountries,
  });

  if (input.binding?.channelId) {
    const existing = await input.guild.channels.fetch(input.binding.channelId).catch(() => null);
    if (isManagedTextChannel(existing)) {
      const desiredName = reserveUniqueChannelName({
        base: input.binding.sportSlug || input.sport.channelSlug,
        usedNames: input.usedNames,
        currentName: existing.name,
      });
      await existing.edit({
        name: desiredName,
        parent: input.category.id,
        topic: desiredTopic,
      });
      return { channel: existing, created: false };
    }
  }

  const desiredName = reserveUniqueChannelName({
    base: input.sport.channelSlug,
    usedNames: input.usedNames,
  });
  const channel = await input.guild.channels.create({
    name: desiredName,
    type: ChannelType.GuildText,
    parent: input.category.id,
    topic: desiredTopic,
  });

  return { channel, created: true };
}

async function syncManagedTextChannelTopic(channel: TextChannel, desiredTopic: string): Promise<void> {
  if (channel.topic === desiredTopic) {
    return;
  }

  await channel.edit({ topic: desiredTopic });
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

async function getRequiredGuildContext(guildId: string): Promise<{
  config: SportsGuildConfigSummary;
  bindings: SportsChannelBindingSummary[];
}> {
  const [configResult, bindingsResult] = await Promise.all([
    sportsService.getGuildConfig({ guildId }),
    sportsService.listChannelBindings({ guildId }),
  ]);

  if (configResult.isErr()) {
    throw configResult.error;
  }
  if (bindingsResult.isErr()) {
    throw bindingsResult.error;
  }
  if (!configResult.value) {
    throw new AppError('SPORTS_CONFIG_NOT_FOUND', 'Sports configuration not found for this server.', 404);
  }

  return {
    config: configResult.value,
    bindings: bindingsResult.value,
  };
}

async function getTodayListingsBySport(config: SportsGuildConfigSummary): Promise<{
  localDate: string;
  dateLabel: string;
  listingsBySport: Map<string, SportsListing[]>;
  degraded: boolean;
  successfulCountries: string[];
  failedCountries: string[];
}> {
  const localDate = resolveSportsLocalDate({
    timezone: config.timezone,
    at: new Date(),
  });
  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${localDate}T12:00:00Z`));

  const listingsResult = await sportsDataService.listDailyListingsForLocalDateAcrossCountries({
    localDate,
    timezone: config.timezone,
    broadcastCountries: config.broadcastCountries,
  });
  if (listingsResult.isErr()) {
    throw listingsResult.error;
  }

  if (listingsResult.value.degraded) {
    logger.warn(
      {
        localDate,
        timezone: config.timezone,
        successfulCountries: listingsResult.value.successfulCountries,
        failedCountries: listingsResult.value.failedCountries,
      },
      'sports daily multi-country listings degraded',
    );
  }

  const listingsBySport = new Map(
    listingsResult.value.data
      .filter((entry) => entry.listings.length > 0)
      .map((entry) => [entry.sportName, entry.listings]),
  );
  const successfulCountries =
    listingsResult.value.successfulCountries.length > 0
      ? listingsResult.value.successfulCountries
      : config.broadcastCountries;

  return {
    localDate,
    dateLabel,
    listingsBySport,
    degraded: listingsResult.value.degraded,
    successfulCountries,
    failedCountries: listingsResult.value.failedCountries,
  };
}

export async function syncSportsGuildChannels(input: {
  guild: Guild;
  actorDiscordUserId: string;
  categoryName: string | null;
  broadcastCountries?: string[] | null;
  broadcastCountry?: string | null;
  liveCategoryName?: string | null;
}): Promise<{
  config: SportsGuildConfigSummary;
  channelCount: number;
  createdChannelCount: number;
  updatedChannelCount: number;
}> {
  const existingConfigResult = await sportsService.getGuildConfig({ guildId: input.guild.id });
  if (existingConfigResult.isErr()) {
    throw existingConfigResult.error;
  }

  const category = await ensureManagedCategory({
    guild: input.guild,
    existingCategoryChannelId: existingConfigResult.value?.managedCategoryChannelId,
    categoryName: input.categoryName,
  });
  const liveCategory = await ensureOptionalManagedCategory({
    guild: input.guild,
    existingCategoryChannelId: existingConfigResult.value?.liveCategoryChannelId,
    categoryName: input.liveCategoryName ?? null,
  });

  const configResult = await sportsService.upsertGuildConfig({
    guildId: input.guild.id,
    managedCategoryChannelId: category.id,
    liveCategoryChannelId: liveCategory?.id ?? null,
    localTimeHhMm: existingConfigResult.value?.localTimeHhMm ?? env.SPORTS_DEFAULT_PUBLISH_TIME,
    timezone: existingConfigResult.value?.timezone ?? env.SPORTS_DEFAULT_TIMEZONE,
    broadcastCountries:
      input.broadcastCountries?.map((country) => country.trim()).filter((country) => country.length > 0) ??
      (input.broadcastCountry?.trim() ? [input.broadcastCountry.trim()] : null) ??
      existingConfigResult.value?.broadcastCountries ??
      DEFAULT_SHARED_BROADCAST_COUNTRIES,
    actorDiscordUserId: input.actorDiscordUserId,
  });
  if (configResult.isErr()) {
    throw configResult.error;
  }

  const bindingsResult = await sportsService.listChannelBindings({ guildId: input.guild.id });
  if (bindingsResult.isErr()) {
    throw bindingsResult.error;
  }

  const dedupedBindingsResult = await reconcileDuplicateBindings({
    guild: input.guild,
    category,
    bindings: bindingsResult.value,
  });

  const { listingsBySport, degraded, successfulCountries, failedCountries } =
    await getTodayListingsBySport(configResult.value);
  const bindingsBySport = new Map(
    dedupedBindingsResult.bindings.map((binding) => [binding.sportName, binding]),
  );
  const fetchedChannels = await input.guild.channels.fetch();
  const usedNames = new Set(
    [...fetchedChannels.values()]
      .filter((channel): channel is NonNullable<typeof channel> => channel !== null)
      .filter((channel) => !dedupedBindingsResult.removedChannelIds.has(channel.id))
      .map((channel) => channel.name),
  );

  let createdChannelCount = 0;
  let updatedChannelCount = 0;

  for (const [sportName] of listingsBySport) {
    const binding = bindingsBySport.get(sportName) ?? null;
    const ensured = await ensureManagedTextChannel({
      guild: input.guild,
      category,
      binding,
      sport: {
        sportId: binding?.sportId ?? null,
        sportName,
        channelSlug: binding?.sportSlug ?? normalizeChannelName(sportName),
      },
      config: configResult.value,
      usedNames,
      topicBroadcastCountries: successfulCountries,
      topicDegraded: degraded,
      topicFailedCountries: failedCountries,
    });

    const bindingResult = await sportsService.upsertChannelBinding({
      guildId: input.guild.id,
      sportId: binding?.sportId ?? null,
      sportName,
      sportSlug: ensured.channel.name,
      channelId: ensured.channel.id,
    });
    if (bindingResult.isErr()) {
      throw bindingResult.error;
    }

    bindingsBySport.set(sportName, bindingResult.value);

    if (ensured.created) {
      createdChannelCount += 1;
    } else {
      updatedChannelCount += 1;
    }
  }

  await removeOrphanedManagedChannels({
    guild: input.guild,
    category,
    activeChannelIds: new Set(
      [...bindingsBySport.values()].map((binding) => binding.channelId),
    ),
    removedChannelIds: dedupedBindingsResult.removedChannelIds,
  });

  return {
    config: configResult.value,
    channelCount: listingsBySport.size,
    createdChannelCount,
    updatedChannelCount,
  };
}

export async function publishSportsForGuild(input: {
  guild: Guild;
  actorDiscordUserId: string | null;
}): Promise<{
  publishedChannelCount: number;
  listingCount: number;
  createdChannelCount: number;
}> {
  const { config, bindings } = await getRequiredGuildContext(input.guild.id);
  const { dateLabel, listingsBySport, degraded, successfulCountries, failedCountries } =
    await getTodayListingsBySport(config);
  const category =
    config.managedCategoryChannelId &&
    (await input.guild.channels.fetch(config.managedCategoryChannelId).catch(() => null));

  const fetchedChannels = await input.guild.channels.fetch();
  const usedNames = new Set(
    [...fetchedChannels.values()]
      .filter((channel): channel is NonNullable<typeof channel> => channel !== null)
      .map((channel) => channel.name),
  );

  let createdChannelCount = 0;
  const bindingMap = new Map(bindings.map((binding) => [binding.sportName, binding]));
  const desiredTopic = buildManagedChannelTopic({
    timezone: config.timezone,
    publishTime: config.localTimeHhMm,
    broadcastCountries: successfulCountries,
    degraded,
    failedCountries,
  });

  for (const [sportName] of listingsBySport) {
    if (bindingMap.has(sportName) || !isCategoryChannel(category)) {
      continue;
    }

    const ensured = await ensureManagedTextChannel({
      guild: input.guild,
      category,
      binding: null,
      sport: {
        sportId: null,
        sportName,
        channelSlug: normalizeChannelName(sportName),
      },
      config,
      usedNames,
      topicBroadcastCountries: successfulCountries,
      topicDegraded: degraded,
      topicFailedCountries: failedCountries,
    });
    const bindingResult = await sportsService.upsertChannelBinding({
      guildId: input.guild.id,
      sportId: null,
      sportName,
      sportSlug: ensured.channel.name,
      channelId: ensured.channel.id,
    });
    if (bindingResult.isErr()) {
      throw bindingResult.error;
    }

    bindingMap.set(sportName, bindingResult.value);
    createdChannelCount += 1;
  }

  let publishedChannelCount = 0;
  let listingCount = 0;

  for (const [sportName, listings] of listingsBySport) {
    const binding = bindingMap.get(sportName);
    if (!binding) {
      continue;
    }

    const channel = await input.guild.channels.fetch(binding.channelId).catch(() => null);
    if (!isManagedTextChannel(channel)) {
      continue;
    }

    await syncManagedTextChannelTopic(channel, desiredTopic);
    await clearManagedChannel(channel);
    await channel.send({
      content: buildSportHeaderMessage({
        sportName: binding.sportName,
        dateLabel,
        broadcastCountries: successfulCountries,
        listingsCount: listings.length,
        degraded,
        failedCountries,
      }),
    });

    const embeds = listings.map((listing) => buildSportEventEmbed(listing, config.timezone));
    for (const embedChunk of chunkArray(embeds, 10)) {
      await channel.send({ embeds: embedChunk });
    }

    listingCount += listings.length;
    publishedChannelCount += 1;
  }

  for (const binding of bindingMap.values()) {
    if (listingsBySport.has(binding.sportName)) {
      continue;
    }

    const channel = await input.guild.channels.fetch(binding.channelId).catch(() => null);
    if (!isManagedTextChannel(channel)) {
      continue;
    }

    await syncManagedTextChannelTopic(channel, desiredTopic);
    if (degraded) {
      continue;
    }

    await clearManagedChannel(channel);
  }

  return {
    publishedChannelCount,
    listingCount,
    createdChannelCount,
  };
}

async function runDueSchedules(client: Client): Promise<void> {
  const dueResult = await sportsService.listDueGuilds({
    now: new Date(),
    limit: 10,
  });

  if (dueResult.isErr()) {
    logger.warn({ err: dueResult.error }, 'sports scheduler could not load due guilds');
    return;
  }

  for (const config of dueResult.value) {
    try {
      const activationState = await sportsAccessService.getGuildActivationState({
        guildId: config.guildId,
      });
      if (activationState.isErr()) {
        throw activationState.error;
      }

      if (!activationState.value.activated) {
        const reschedule = await sportsService.rescheduleNextRun({
          guildId: config.guildId,
          now: new Date(),
          updatedByDiscordUserId: null,
        });
        if (reschedule.isErr()) {
          throw reschedule.error;
        }
        continue;
      }

      const guild = await client.guilds.fetch(config.guildId);
      await publishSportsForGuild({
        guild,
        actorDiscordUserId: null,
      });

      const completed = await sportsService.markPublishCompleted({
        guildId: config.guildId,
        executedAt: new Date(),
        updatedByDiscordUserId: null,
      });
      if (completed.isErr()) {
        throw completed.error;
      }
    } catch (error) {
      logger.warn(
        {
          guildId: config.guildId,
          errorMessage: error instanceof Error ? error.message : 'unknown',
        },
        'sports scheduler publish failed',
      );

      const retry = await sportsService.scheduleRetry({
        guildId: config.guildId,
        retryAt: new Date(Date.now() + RETRY_DELAY_MS),
        updatedByDiscordUserId: null,
      });
      if (retry.isErr()) {
        logger.warn(
          { guildId: config.guildId, err: retry.error },
          'sports scheduler could not schedule retry',
        );
      }
    }
  }
}

function queueSchedulerTick(client: Client): void {
  if (schedulerTickInFlight) {
    return;
  }

  schedulerTickInFlight = true;
  void runDueSchedules(client).finally(() => {
    schedulerTickInFlight = false;
  });
}

export function startSportsScheduler(client: Client, pollIntervalMs: number): void {
  if (schedulerTimer) {
    return;
  }

  const effectivePollIntervalMs = Math.max(5_000, Math.floor(pollIntervalMs));
  queueSchedulerTick(client);
  schedulerTimer = setInterval(() => {
    queueSchedulerTick(client);
  }, effectivePollIntervalMs);
  schedulerTimer.unref?.();
}

export function stopSportsScheduler(): void {
  if (!schedulerTimer) {
    return;
  }

  clearInterval(schedulerTimer);
  schedulerTimer = null;
  schedulerTickInFlight = false;
}

const ACTIONABLE_CODES = new Set([
  'SPORTS_API_KEY_MISSING',
  'SPORTS_API_REQUEST_FAILED',
  'SPORTS_CONFIG_NOT_FOUND',
]);

export function mapSportsError(error: unknown): string {
  if (error instanceof AppError) {
    if (ACTIONABLE_CODES.has(error.code)) {
      return error.message;
    }

    if (error.statusCode >= 500) {
      return 'Sports worker failed due to an internal error. Please try again and check logs.';
    }
    return error.message;
  }

  return 'Sports worker failed due to an internal error. Please try again and check logs.';
}
