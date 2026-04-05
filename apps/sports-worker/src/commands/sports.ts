import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Guild,
  type PermissionsBitField,
} from 'discord.js';
import {
  SportsAccessService,
  SportsLiveEventService,
  SportsService,
  type SportsGuildConfigSummary,
  type SportsProfileSummary,
  getEnv,
} from '@voodoo/core';

import {
  mapSportsError,
  publishSportsForGuild,
  syncSportsGuildChannels,
  upsertSportsProfileChannels,
} from '../sports-runtime.js';

const sportsAccessService = new SportsAccessService();
const sportsLiveEventService = new SportsLiveEventService();
const sportsService = new SportsService();

function isSuperAdminUser(discordUserId: string): boolean {
  return getEnv().superAdminDiscordIds.includes(discordUserId);
}

function hasManageGuildAccess(interaction: ChatInputCommandInteraction): boolean {
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) === true ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) === true
  );
}

function getSportsCommandLockedMessage(authorizedUserCount: number): string {
  if (authorizedUserCount === 0) {
    return 'This sports worker is locked for this server. A super admin must activate this server by granting your Discord ID access before `/sports` commands can be used here.';
  }

  return 'This sports worker is active for this server, but your Discord ID is not on the `/sports` allowlist. A super admin must grant your Discord ID access before you can use `/sports` commands here.';
}

async function deferEphemeralReply(interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
}

async function sendEphemeralReply(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  if (interaction.deferred) {
    await interaction.editReply({ content });
    return;
  }

  if (interaction.replied) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function getBotGuildPermissions(
  guild: Guild,
): Promise<Readonly<PermissionsBitField> | null> {
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  return me?.permissions ?? null;
}

async function getSportsPermissionError(
  interaction: ChatInputCommandInteraction,
): Promise<string | null> {
  if (!interaction.inGuild() || !interaction.guild) {
    return 'This command can only be used inside a Discord server.';
  }

  if (!hasManageGuildAccess(interaction)) {
    return 'You need `Manage Server` or `Administrator` permission to manage sports listings.';
  }

  const permissions = await getBotGuildPermissions(interaction.guild);
  if (!permissions) {
    return 'I could not verify my Discord permissions for this server. Please try again.';
  }

  const requiredPermissions = [
    { bit: PermissionFlagsBits.ViewChannel, label: 'View Channel' },
    { bit: PermissionFlagsBits.ManageChannels, label: 'Manage Channels' },
    { bit: PermissionFlagsBits.SendMessages, label: 'Send Messages' },
    { bit: PermissionFlagsBits.EmbedLinks, label: 'Embed Links' },
    { bit: PermissionFlagsBits.ManageMessages, label: 'Manage Messages' },
    { bit: PermissionFlagsBits.ReadMessageHistory, label: 'Read Message History' },
  ] as const;

  const missing = requiredPermissions
    .filter((permission) => !permissions.has(permission.bit))
    .map((permission) => permission.label);

  if (missing.length > 0) {
    return `I am missing required server permissions: ${missing.join(', ')}.`;
  }

  return null;
}

function buildSportsStatusMessage(input: {
  activated: boolean;
  authorizedUserCount: number;
  channelCount: number;
  config: SportsGuildConfigSummary | null;
  profiles: SportsProfileSummary[];
}): string {
  const profileLines =
    input.profiles.length === 0
      ? ['Profiles: none configured']
      : [
          'Profiles:',
          ...input.profiles.map(
            (profile) =>
              `- ${profile.label} [${profile.slug}] | ${profile.broadcastCountry} | daily: ${
                profile.dailyCategoryChannelId ? `<#${profile.dailyCategoryChannelId}>` : 'Not set'
              } | live: ${profile.liveCategoryChannelId ? `<#${profile.liveCategoryChannelId}>` : 'Not set'} | ${
                profile.enabled ? 'Enabled' : 'Disabled'
              }`,
          ),
        ];

  if (!input.config) {
    return [
      'Sports worker status for this server:',
      `Activation: ${input.activated ? 'Active' : 'Pending'}`,
      `Authorized users: ${input.authorizedUserCount}`,
      `Managed channels: ${input.channelCount}`,
      'No sports configuration exists yet.',
      ...profileLines,
      'Next step: run `/sports setup` to create the managed channels and publish today\'s schedule.',
    ].join('\n');
  }

  return [
    'Sports worker status for this server:',
    `Activation: ${input.activated ? 'Active' : 'Pending'}`,
    `Authorized users: ${input.authorizedUserCount}`,
    `Managed category: ${input.config.managedCategoryChannelId ? `<#${input.config.managedCategoryChannelId}>` : 'Not set'}`,
    `Live event category: ${input.config.liveCategoryChannelId ? `<#${input.config.liveCategoryChannelId}>` : 'Not set'}`,
    `Managed channels: ${input.channelCount}`,
    `Publish time: ${input.config.localTimeHhMm}`,
    `Timezone: ${input.config.timezone}`,
    `Broadcaster country: ${input.config.broadcastCountry}`,
    `Next run (UTC): ${input.config.nextRunAtUtc}`,
    `Last run (UTC): ${input.config.lastRunAtUtc ?? 'Never'}`,
    `Last local run date: ${input.config.lastLocalRunDate ?? 'Never'}`,
    ...profileLines,
  ].join('\n');
}

function buildProfilesMessage(profiles: SportsProfileSummary[]): string {
  if (profiles.length === 0) {
    return 'No sports profiles are configured for this server yet.';
  }

  return [
    `Sports profiles for this server: ${profiles.length}`,
    ...profiles.map(
      (profile) =>
        `- ${profile.label} [${profile.slug}] | ${profile.broadcastCountry} | daily: ${
          profile.dailyCategoryChannelId ? `<#${profile.dailyCategoryChannelId}>` : 'Not set'
        } | live: ${profile.liveCategoryChannelId ? `<#${profile.liveCategoryChannelId}>` : 'Not set'} | ${
          profile.enabled ? 'Enabled' : 'Disabled'
        }`,
    ),
  ].join('\n');
}

function buildSportsLiveStatusMessage(input: {
  trackedEvents: Array<{
    status: 'scheduled' | 'live' | 'finished' | 'cleanup_due' | 'deleted' | 'failed';
    lastSyncedAtUtc: Date | null;
  }>;
  now: Date;
  pollIntervalMs: number;
}): string {
  const trackedEvents = input.trackedEvents.filter((event) => event.status !== 'deleted');
  const liveCount = trackedEvents.filter((event) => event.status === 'live').length;
  const pendingCleanupCount = trackedEvents.filter((event) => event.status === 'cleanup_due').length;
  const staleThresholdMs = Math.max(input.pollIntervalMs * 3, 5 * 60 * 1000);
  const staleCount = trackedEvents.filter((event) => {
    if (event.status === 'cleanup_due') {
      return false;
    }

    if (!event.lastSyncedAtUtc) {
      return true;
    }

    return input.now.getTime() - event.lastSyncedAtUtc.getTime() > staleThresholdMs;
  }).length;
  const latestSync = trackedEvents
    .map((event) => event.lastSyncedAtUtc)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0];

  const syncHealth =
    trackedEvents.length === 0
      ? 'Idle'
      : staleCount === 0
        ? 'Healthy'
        : `Degraded (${staleCount} stale tracked event${staleCount === 1 ? '' : 's'})`;

  return [
    'Sports live sync status for this server:',
    `Tracked live events: ${trackedEvents.length}`,
    `Currently live: ${liveCount}`,
    `Pending cleanup: ${pendingCleanupCount}`,
    `Sync health: ${syncHealth}`,
    `Latest tracked sync (UTC): ${latestSync?.toISOString() ?? 'Never'}`,
  ].join('\n');
}

function buildSetupMessage(input: {
  guildId: string;
  activated: boolean;
  authorizedUserCount: number;
  setup: Awaited<ReturnType<typeof syncSportsGuildChannels>>;
  publish: Awaited<ReturnType<typeof publishSportsForGuild>>;
}): string {
  const lines = [
    'Sports worker setup is complete for this server.',
    `Managed category: ${input.setup.config.managedCategoryChannelId ? `<#${input.setup.config.managedCategoryChannelId}>` : 'Not set'}`,
    `Live event category: ${input.setup.config.liveCategoryChannelId ? `<#${input.setup.config.liveCategoryChannelId}>` : 'Not set'}`,
    `Tracked sport channels: ${input.setup.channelCount}`,
    `Channels created: ${input.setup.createdChannelCount}`,
    `Channels updated: ${input.setup.updatedChannelCount}`,
    `Channels published today: ${input.publish.publishedChannelCount}`,
    `Events posted today: ${input.publish.listingCount}`,
    `Next scheduled run (UTC): ${input.setup.config.nextRunAtUtc}`,
  ];

  if (!input.activated) {
    lines.push(
      `Activation is still pending. Run \`/activation grant guild_id:${input.guildId} user_id:<customer-user-id>\` to enable daily automation and customer \`/search\` usage.`,
    );
  } else if (input.authorizedUserCount > 0) {
    lines.push(`Activation is active for ${input.authorizedUserCount} authorized user(s).`);
  }

  if (!input.setup.config.liveCategoryChannelId) {
    lines.push('Live event channels are disabled until a live event category is configured.');
  }

  return lines.join('\n');
}

function buildProfileAddMessage(input: {
  result: Awaited<ReturnType<typeof upsertSportsProfileChannels>>;
  action: 'added' | 'updated';
}): string {
  return [
    `Sports profile \`${input.result.profile.label}\` was ${input.action}.`,
    `Broadcast country: ${input.result.profile.broadcastCountry}`,
    `Daily category: ${input.result.profile.dailyCategoryChannelId ? `<#${input.result.profile.dailyCategoryChannelId}>` : 'Not set'}`,
    `Live category: ${input.result.profile.liveCategoryChannelId ? `<#${input.result.profile.liveCategoryChannelId}>` : 'Not set'}`,
    `Enabled: ${input.result.profile.enabled ? 'Yes' : 'No'}`,
    `Tracked sport channels: ${input.result.channelCount}`,
    `Channels created: ${input.result.createdChannelCount}`,
    `Channels updated: ${input.result.updatedChannelCount}`,
  ].join('\n');
}

function buildProfileRemovedMessage(profile: SportsProfileSummary): string {
  return [
    `Sports profile \`${profile.label}\` was removed.`,
    'Managed Discord categories and channels were left in place.',
    'Daily publishing and live tracking for this profile are now disabled.',
  ].join('\n');
}

async function reconcileGuildConfigAfterProfileRemoval(input: {
  guildId: string;
  actorDiscordUserId: string;
  removedProfile: SportsProfileSummary;
}): Promise<void> {
  const [configResult, profilesResult] = await Promise.all([
    sportsService.getGuildConfig({ guildId: input.guildId }),
    sportsService.listProfiles({ guildId: input.guildId }),
  ]);

  if (configResult.isErr()) {
    throw configResult.error;
  }
  if (profilesResult.isErr()) {
    throw profilesResult.error;
  }

  const config = configResult.value;
  if (!config) {
    return;
  }

  const overlapsManagedCategory = config.managedCategoryChannelId === input.removedProfile.dailyCategoryChannelId;
  const overlapsLiveCategory = config.liveCategoryChannelId === input.removedProfile.liveCategoryChannelId;
  const overlapsCountry = config.broadcastCountry === input.removedProfile.broadcastCountry;

  if (!overlapsManagedCategory && !overlapsLiveCategory && !overlapsCountry) {
    return;
  }

  const replacement = profilesResult.value[0] ?? null;
  const updatedConfigResult = await sportsService.upsertGuildConfig({
    guildId: input.guildId,
    managedCategoryChannelId: replacement?.dailyCategoryChannelId ?? null,
    liveCategoryChannelId: replacement?.liveCategoryChannelId ?? null,
    localTimeHhMm: config.localTimeHhMm,
    timezone: config.timezone,
    broadcastCountry: replacement?.broadcastCountry ?? getEnv().SPORTS_BROADCAST_COUNTRY,
    actorDiscordUserId: input.actorDiscordUserId,
  });
  if (updatedConfigResult.isErr()) {
    throw updatedConfigResult.error;
  }
}

export const sportsCommand = {
  data: new SlashCommandBuilder()
    .setName('sports')
    .setDescription('Configure and publish the automated sports listing channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Create or refresh the managed sports channels and publish today\'s listings')
        .addStringOption((option) =>
          option
            .setName('category_name')
            .setDescription('Optional category name for the managed sport channels')
            .setMaxLength(90),
        )
        .addStringOption((option) =>
          option
            .setName('broadcast_country')
            .setDescription('Optional broadcaster country filter, for example United States')
            .setMaxLength(120),
        )
        .addStringOption((option) =>
          option
            .setName('live_category_name')
            .setDescription('Optional category name for live scores and highlights channels')
            .setMaxLength(90),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('sync')
        .setDescription('Create any missing sport channels and refresh the managed channel mapping')
        .addStringOption((option) =>
          option
            .setName('category_name')
            .setDescription('Optional category name for the managed sport channels')
            .setMaxLength(90),
        )
        .addStringOption((option) =>
          option
            .setName('broadcast_country')
            .setDescription('Optional broadcaster country filter, for example United States')
            .setMaxLength(120),
        )
        .addStringOption((option) =>
          option
            .setName('live_category_name')
            .setDescription('Optional category name for live scores and highlights channels')
            .setMaxLength(90),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('refresh')
        .setDescription('Delete the old daily posts and publish fresh listings for today'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Show sports worker activation, schedule, and channel status'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('live-status')
        .setDescription('Show tracked live events, cleanup counts, and sync health'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('profile-add')
        .setDescription('Add a sports profile for one broadcast country')
        .addStringOption((option) =>
          option.setName('label').setDescription('Profile label').setRequired(true).setMaxLength(80),
        )
        .addStringOption((option) =>
          option
            .setName('broadcast_country')
            .setDescription('Broadcast country for this profile')
            .setRequired(true)
            .setMaxLength(120),
        )
        .addStringOption((option) =>
          option
            .setName('daily_category_name')
            .setDescription('Category name for daily listings')
            .setRequired(true)
            .setMaxLength(90),
        )
        .addStringOption((option) =>
          option
            .setName('live_category_name')
            .setDescription('Category name for live scores and highlights')
            .setRequired(true)
            .setMaxLength(90),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('profiles').setDescription('List configured sports profiles'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('profile-update')
        .setDescription('Update an existing sports profile')
        .addStringOption((option) =>
          option
            .setName('profile')
            .setDescription('Existing profile slug or label')
            .setRequired(true)
            .setMaxLength(80),
        )
        .addStringOption((option) =>
          option.setName('label').setDescription('New profile label').setMaxLength(80),
        )
        .addStringOption((option) =>
          option
            .setName('broadcast_country')
            .setDescription('New broadcast country')
            .setMaxLength(120),
        )
        .addStringOption((option) =>
          option
            .setName('daily_category_name')
            .setDescription('Rename or reuse the daily listings category')
            .setMaxLength(90),
        )
        .addStringOption((option) =>
          option
            .setName('live_category_name')
            .setDescription('Rename or reuse the live scores and highlights category')
            .setMaxLength(90),
        )
        .addBooleanOption((option) =>
          option.setName('enabled').setDescription('Enable or disable this profile'),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('profile-remove')
        .setDescription('Remove a sports profile from this server')
        .addStringOption((option) =>
          option
            .setName('profile')
            .setDescription('Profile slug or label')
            .setRequired(true)
            .setMaxLength(80),
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guild) {
      await sendEphemeralReply(
        interaction,
        'This command can only be used inside a Discord server.',
      );
      return;
    }

    await deferEphemeralReply(interaction);

    try {
      const permissionError = await getSportsPermissionError(interaction);
      if (permissionError) {
        await sendEphemeralReply(interaction, permissionError);
        return;
      }

      const subcommand = interaction.options.getSubcommand(true);
      const isSuperAdmin = isSuperAdminUser(interaction.user.id);
      const guildId = interaction.guild.id;

      if (!isSuperAdmin) {
        const accessState = await sportsAccessService.getCommandAccessState({
          guildId,
          discordUserId: interaction.user.id,
        });
        if (accessState.isErr()) {
          await sendEphemeralReply(interaction, mapSportsError(accessState.error));
          return;
        }

        if (accessState.value.locked && !accessState.value.allowed) {
          await sendEphemeralReply(
            interaction,
            getSportsCommandLockedMessage(accessState.value.authorizedUserCount),
          );
          return;
        }
      }

      if (subcommand === 'status') {
        const [statusResult, profilesResult] = await Promise.all([
          sportsService.getGuildStatus({ guildId }),
          sportsService.listProfiles({ guildId }),
        ]);
        if (statusResult.isErr()) {
          await sendEphemeralReply(interaction, mapSportsError(statusResult.error));
          return;
        }
        if (profilesResult.isErr()) {
          await sendEphemeralReply(interaction, mapSportsError(profilesResult.error));
          return;
        }

        await sendEphemeralReply(
          interaction,
          buildSportsStatusMessage({
            activated: statusResult.value.activated,
            authorizedUserCount: statusResult.value.authorizedUserCount,
            channelCount: statusResult.value.channelCount,
            config: statusResult.value.config,
            profiles: profilesResult.value,
          }),
        );
        return;
      }

      if (subcommand === 'profiles') {
        const profilesResult = await sportsService.listProfiles({ guildId });
        if (profilesResult.isErr()) {
          await sendEphemeralReply(interaction, mapSportsError(profilesResult.error));
          return;
        }

        await sendEphemeralReply(interaction, buildProfilesMessage(profilesResult.value));
        return;
      }

      if (subcommand === 'live-status') {
        const trackedEventsResult = await sportsLiveEventService.listTrackedEvents({ guildId });
        if (trackedEventsResult.isErr()) {
          await sendEphemeralReply(interaction, mapSportsError(trackedEventsResult.error));
          return;
        }

        await sendEphemeralReply(
          interaction,
          buildSportsLiveStatusMessage({
            trackedEvents: trackedEventsResult.value,
            now: new Date(),
            pollIntervalMs: getEnv().SPORTS_POLL_INTERVAL_MS,
          }),
        );
        return;
      }

      if (subcommand === 'sync') {
        const categoryName = interaction.options.getString('category_name');
        const broadcastCountry = interaction.options.getString('broadcast_country');
        const liveCategoryName = interaction.options.getString('live_category_name');
        const syncResult = await syncSportsGuildChannels({
          guild: interaction.guild,
          actorDiscordUserId: interaction.user.id,
          categoryName,
          broadcastCountry,
          liveCategoryName,
        });

        await sendEphemeralReply(
          interaction,
          [
            'Sports channel sync completed.',
            `Managed category: ${syncResult.config.managedCategoryChannelId ? `<#${syncResult.config.managedCategoryChannelId}>` : 'Not set'}`,
            `Live event category: ${syncResult.config.liveCategoryChannelId ? `<#${syncResult.config.liveCategoryChannelId}>` : 'Not set'}`,
            `Tracked sport channels: ${syncResult.channelCount}`,
            `Channels created: ${syncResult.createdChannelCount}`,
            `Channels updated: ${syncResult.updatedChannelCount}`,
            `Next scheduled run (UTC): ${syncResult.config.nextRunAtUtc}`,
          ].join('\n'),
        );
        return;
      }

      if (subcommand === 'profile-add') {
        const label = interaction.options.getString('label', true);
        const broadcastCountry = interaction.options.getString('broadcast_country', true);
        const dailyCategoryName = interaction.options.getString('daily_category_name', true);
        const liveCategoryName = interaction.options.getString('live_category_name', true);
        const result = await upsertSportsProfileChannels({
          guild: interaction.guild,
          actorDiscordUserId: interaction.user.id,
          label,
          broadcastCountry,
          dailyCategoryName,
          liveCategoryName,
        });

        await sendEphemeralReply(
          interaction,
          buildProfileAddMessage({
            result,
            action: 'added',
          }),
        );
        return;
      }

      if (subcommand === 'profile-update') {
        const selector = interaction.options.getString('profile', true);
        const label = interaction.options.getString('label');
        const broadcastCountry = interaction.options.getString('broadcast_country');
        const dailyCategoryName = interaction.options.getString('daily_category_name');
        const liveCategoryName = interaction.options.getString('live_category_name');
        const enabled = interaction.options.getBoolean('enabled');
        const profileResult = await sportsService.getProfile({
          guildId,
          selector,
        });
        if (profileResult.isErr()) {
          await sendEphemeralReply(interaction, mapSportsError(profileResult.error));
          return;
        }
        if (!profileResult.value) {
          await sendEphemeralReply(
            interaction,
            `No sports profile matched \`${selector}\` for this server.`,
          );
          return;
        }

        const result = await upsertSportsProfileChannels({
          guild: interaction.guild,
          actorDiscordUserId: interaction.user.id,
          slug: profileResult.value.slug,
          label: label?.trim() || profileResult.value.label,
          broadcastCountry: broadcastCountry?.trim() || profileResult.value.broadcastCountry,
          dailyCategoryName,
          liveCategoryName,
          enabled: enabled ?? profileResult.value.enabled,
        });

        await sendEphemeralReply(
          interaction,
          buildProfileAddMessage({
            result,
            action: 'updated',
          }),
        );
        return;
      }

      if (subcommand === 'profile-remove') {
        const selector = interaction.options.getString('profile', true);
        const removedProfileResult = await sportsService.removeProfile({
          guildId,
          selector,
        });
        if (removedProfileResult.isErr()) {
          await sendEphemeralReply(interaction, mapSportsError(removedProfileResult.error));
          return;
        }

        await reconcileGuildConfigAfterProfileRemoval({
          guildId,
          actorDiscordUserId: interaction.user.id,
          removedProfile: removedProfileResult.value,
        });

        await sendEphemeralReply(interaction, buildProfileRemovedMessage(removedProfileResult.value));
        return;
      }

      if (subcommand === 'refresh') {
        const publishResult = await publishSportsForGuild({
          guild: interaction.guild,
          actorDiscordUserId: interaction.user.id,
        });

        await sendEphemeralReply(
          interaction,
          [
            'Sports listings were refreshed for today.',
            `Channels published: ${publishResult.publishedChannelCount}`,
            `Events posted: ${publishResult.listingCount}`,
            `New channels created during refresh: ${publishResult.createdChannelCount}`,
          ].join('\n'),
        );
        return;
      }

      if (subcommand === 'setup') {
        const categoryName = interaction.options.getString('category_name');
        const broadcastCountry = interaction.options.getString('broadcast_country');
        const liveCategoryName = interaction.options.getString('live_category_name');
        const [activationStateResult, syncResult] = await Promise.all([
          sportsAccessService.getGuildActivationState({ guildId }),
          syncSportsGuildChannels({
            guild: interaction.guild,
            actorDiscordUserId: interaction.user.id,
            categoryName,
            broadcastCountry,
            liveCategoryName,
          }),
        ]);

        if (activationStateResult.isErr()) {
          await sendEphemeralReply(interaction, mapSportsError(activationStateResult.error));
          return;
        }

        const publishResult = await publishSportsForGuild({
          guild: interaction.guild,
          actorDiscordUserId: interaction.user.id,
        });

        await sendEphemeralReply(
          interaction,
          buildSetupMessage({
            guildId,
            activated: activationStateResult.value.activated,
            authorizedUserCount: activationStateResult.value.authorizedUserCount,
            setup: syncResult,
            publish: publishResult,
          }),
        );
        return;
      }

      await sendEphemeralReply(interaction, `Unknown sports subcommand: ${subcommand}`);
    } catch (error) {
      await sendEphemeralReply(interaction, mapSportsError(error));
    }
  },
};
