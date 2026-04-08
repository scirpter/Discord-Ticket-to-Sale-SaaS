import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MessageFlags,
  PermissionFlagsBits,
  type APIApplicationCommandBasicOption,
  type APIApplicationCommandSubcommandOption,
  type ChatInputCommandInteraction,
} from 'discord.js';

vi.mock('@voodoo/core', () => {
  class SportsAccessService {
    public async getCommandAccessState(): Promise<never> {
      throw new Error('Mock getCommandAccessState not implemented');
    }

    public async getGuildActivationState(): Promise<never> {
      throw new Error('Mock getGuildActivationState not implemented');
    }
  }

  class SportsService {
    public async getGuildStatus(): Promise<never> {
      throw new Error('Mock getGuildStatus not implemented');
    }

    public async listProfiles(): Promise<never> {
      throw new Error('Mock listProfiles not implemented');
    }

    public async getProfile(): Promise<never> {
      throw new Error('Mock getProfile not implemented');
    }

    public async removeProfile(): Promise<never> {
      throw new Error('Mock removeProfile not implemented');
    }

    public async getGuildConfig(): Promise<never> {
      throw new Error('Mock getGuildConfig not implemented');
    }

    public async upsertGuildConfig(): Promise<never> {
      throw new Error('Mock upsertGuildConfig not implemented');
    }

    public async listChannelBindings(): Promise<never> {
      throw new Error('Mock listChannelBindings not implemented');
    }
  }

  class SportsDataService {
    public async listDailyListingsForLocalDate(): Promise<never> {
      throw new Error('Mock listDailyListingsForLocalDate not implemented');
    }
  }

  class SportsLiveEventService {
    public async listTrackedEvents(): Promise<never> {
      throw new Error('Mock listTrackedEvents not implemented');
    }
  }

  return {
    SportsAccessService,
    SportsDataService,
    SportsLiveEventService,
    SportsService,
    getEnv: () => ({
      superAdminDiscordIds: (process.env.SUPER_ADMIN_DISCORD_IDS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      SPORTS_DEFAULT_PUBLISH_TIME: '01:00',
      SPORTS_DEFAULT_TIMEZONE: 'Europe/London',
      SPORTS_BROADCAST_COUNTRY: 'United Kingdom',
      SPORTS_POLL_INTERVAL_MS: 60000,
    }),
    resetEnvForTests: () => undefined,
    resolveSportsLocalDate: () => '2026-03-20',
  };
});

vi.mock('../sports-runtime.js', () => ({
  mapSportsError: (error: unknown) => (error instanceof Error ? error.message : 'sports error'),
  publishSportsForGuild: vi.fn(async () => ({
    publishedChannelCount: 2,
    publishedProfileCount: 1,
    listingCount: 4,
    createdChannelCount: 0,
  })),
  syncSportsGuildChannels: vi.fn(async () => ({
    config: {
      configId: 'cfg-1',
      guildId: 'guild-1',
      enabled: true,
      managedCategoryChannelId: 'category-1',
      localTimeHhMm: '01:00',
      timezone: 'Europe/London',
      broadcastCountry: 'United Kingdom',
      nextRunAtUtc: '2026-03-21T01:00:00.000Z',
      lastRunAtUtc: null,
      lastLocalRunDate: null,
    },
    channelCount: 2,
    createdChannelCount: 2,
    updatedChannelCount: 0,
  })),
  upsertSportsProfileChannels: vi.fn(async () => ({
    config: {
      configId: 'cfg-1',
      guildId: 'guild-1',
      enabled: true,
      managedCategoryChannelId: null,
      localTimeHhMm: '00:01',
      timezone: 'Europe/London',
      broadcastCountry: 'United Kingdom',
      nextRunAtUtc: '2026-03-21T00:01:00.000Z',
      lastRunAtUtc: null,
      lastLocalRunDate: null,
    },
    profile: {
      profileId: 'profile-usa',
      guildId: 'guild-1',
      slug: 'usa',
      label: 'USA',
      broadcastCountry: 'United States',
      dailyCategoryChannelId: 'daily-usa',
      liveCategoryChannelId: 'live-usa',
      enabled: true,
    },
    channelCount: 1,
    createdChannelCount: 1,
    updatedChannelCount: 0,
  })),
}));

vi.mock('../live-event-runtime.js', () => ({
  clearLiveEventChannelsForGuild: vi.fn(async () => ({
    deletedChannelCount: 2,
    markedDeletedCount: 2,
  })),
  refreshLiveEventsForGuild: vi.fn(async () => ({
    refreshedProfileCount: 2,
    createdChannelCount: 1,
    updatedChannelCount: 3,
    markedFinishedCount: 1,
    deletedChannelCount: 2,
  })),
}));

import {
  SportsAccessService,
  SportsDataService,
  SportsLiveEventService,
  SportsService,
  resetEnvForTests,
} from '@voodoo/core';

import { clearLiveEventChannelsForGuild, refreshLiveEventsForGuild } from '../live-event-runtime.js';
import { sportsCommand } from './sports.js';

const ORIGINAL_SUPER_ADMIN_DISCORD_IDS = process.env.SUPER_ADMIN_DISCORD_IDS;

function createOkResult<T>(value: T): { isErr: () => false; isOk: () => true; value: T } {
  return {
    isErr: () => false,
    isOk: () => true,
    value,
  };
}

function createInteractionMock(input?: {
  userId?: string;
  subcommand?:
    | 'setup'
    | 'sync'
    | 'refresh'
    | 'status'
    | 'live-status'
    | 'live-refresh'
    | 'live-clear'
    | 'profile-add'
    | 'profiles'
    | 'profile-update'
    | 'profile-remove';
  profile?: string | null;
  label?: string | null;
  categoryName?: string | null;
  dailyCategoryName?: string | null;
  broadcastCountry?: string | null;
  liveCategoryName?: string | null;
  enabled?: boolean | null;
}): {
  interaction: ChatInputCommandInteraction;
  deferReply: ReturnType<typeof vi.fn>;
  editReply: ReturnType<typeof vi.fn>;
} {
  const deferReply = vi.fn(async () => {
    interaction.deferred = true;
  });
  const editReply = vi.fn(async () => undefined);

  const interaction = {
    deferred: false,
    editReply,
    deferReply,
    followUp: vi.fn(async () => undefined),
    guild: {
      id: 'guild-1',
      members: {
        me: {
          permissions: {
            has: vi.fn().mockReturnValue(true),
          },
        },
        fetchMe: vi.fn(async () => ({
          permissions: {
            has: vi.fn().mockReturnValue(true),
          },
        })),
      },
    },
    inGuild: vi.fn().mockReturnValue(true),
    memberPermissions: {
      has: vi.fn((permission: bigint) =>
        permission === PermissionFlagsBits.ManageGuild ||
        permission === PermissionFlagsBits.Administrator,
      ),
    },
    options: {
      getSubcommand: vi.fn().mockReturnValue(input?.subcommand ?? 'status'),
      getString: vi.fn((name: string) => {
        if (name === 'label') {
          return input?.label ?? null;
        }
        if (name === 'profile') {
          return input?.profile ?? null;
        }
        if (name === 'category_name') {
          return input?.categoryName ?? null;
        }
        if (name === 'daily_category_name') {
          return input?.dailyCategoryName ?? null;
        }
        if (name === 'broadcast_country') {
          return input?.broadcastCountry ?? null;
        }
        if (name === 'live_category_name') {
          return input?.liveCategoryName ?? null;
        }

        return null;
      }),
      getBoolean: vi.fn((name: string) => {
        if (name === 'enabled') {
          return input?.enabled ?? null;
        }

        return null;
      }),
    },
    replied: false,
    reply: vi.fn(async () => undefined),
    user: { id: input?.userId ?? 'user-1' },
  } as unknown as ChatInputCommandInteraction & { deferred: boolean };

  return {
    interaction,
    deferReply,
    editReply,
  };
}

function createMessageCollectionWithFreshMessage() {
  return {
    size: 1,
    filter: vi.fn((predicate: (message: { id: string; createdTimestamp: number }) => boolean) => {
      const message = {
        id: 'message-1',
        createdTimestamp: Date.now(),
        delete: vi.fn(async () => undefined),
      };
      return predicate(message)
        ? new Map([[message.id, message]])
        : new Map<string, typeof message>();
    }),
  };
}

function createManagedTextChannel(id: string, name: string) {
  const messages = {
    fetch: vi.fn(async () => createMessageCollectionWithFreshMessage()),
  };

  return {
    id,
    name,
    type: 0,
    parentId: 'category-1',
    topic: 'managed topic',
    send: vi.fn(async () => undefined),
    edit: vi.fn(async () => undefined),
    bulkDelete: vi.fn(async () => undefined),
    messages,
  };
}

describe('sports command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetEnvForTests();

    if (ORIGINAL_SUPER_ADMIN_DISCORD_IDS == null) {
      delete process.env.SUPER_ADMIN_DISCORD_IDS;
    } else {
      process.env.SUPER_ADMIN_DISCORD_IDS = ORIGINAL_SUPER_ADMIN_DISCORD_IDS;
    }
  });

  it('blocks regular users when the sports worker is still locked', async () => {
    process.env.SUPER_ADMIN_DISCORD_IDS = 'owner-1';
    resetEnvForTests();

    vi.spyOn(SportsAccessService.prototype, 'getCommandAccessState').mockResolvedValue(
      createOkResult({
        locked: true,
        allowed: false,
        activated: false,
        authorizedUserCount: 0,
      }) as Awaited<ReturnType<SportsAccessService['getCommandAccessState']>>,
    );

    const { interaction, deferReply, editReply } = createInteractionMock({
      userId: 'user-2',
      subcommand: 'status',
    });

    await sportsCommand.execute(interaction);

    expect(deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(editReply).toHaveBeenCalledWith({
      content:
        'This sports worker is locked for this server. A super admin must activate this server by granting your Discord ID access before `/sports` commands can be used here.',
    });
  });

  it('runs setup and includes the activation-pending note for super admins', async () => {
    process.env.SUPER_ADMIN_DISCORD_IDS = 'owner-1';
    resetEnvForTests();

    vi.spyOn(SportsAccessService.prototype, 'getGuildActivationState').mockResolvedValue(
      createOkResult({
        activated: false,
        authorizedUserCount: 0,
      }) as Awaited<ReturnType<SportsAccessService['getGuildActivationState']>>,
    );

    const { interaction, editReply } = createInteractionMock({
      userId: 'owner-1',
      subcommand: 'setup',
      categoryName: 'Sports Listings',
    });

    await sportsCommand.execute(interaction);

    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining(
        'Activation is still pending. Run `/activation grant guild_id:guild-1 user_id:<customer-user-id>`',
      ),
    });
    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Channels published today: 2'),
    });
    expect(editReply).toHaveBeenCalledWith({
      content: expect.not.stringContaining('Empty sport channels today'),
    });
  });

  it('shows live-status with tracked events, pending cleanup counts, and sync health', async () => {
    vi.spyOn(SportsAccessService.prototype, 'getCommandAccessState').mockResolvedValue(
      createOkResult({
        locked: false,
        allowed: true,
        activated: true,
        authorizedUserCount: 1,
      }) as Awaited<ReturnType<SportsAccessService['getCommandAccessState']>>,
    );
    vi.spyOn(SportsLiveEventService.prototype, 'listTrackedEvents').mockResolvedValue(
      createOkResult([
        {
          id: 'tracked-1',
          guildId: 'guild-1',
          sportName: 'Soccer',
          eventId: 'evt-1',
          eventName: 'Rangers vs Celtic',
          sportChannelId: 'sport-1',
          eventChannelId: 'live-1',
          status: 'live',
          kickoffAtUtc: new Date('2026-03-20T15:00:00.000Z'),
          lastScoreSnapshot: { scoreLabel: '2-1' },
          lastStateSnapshot: { statusLabel: 'Live' },
          lastSyncedAtUtc: new Date(),
          finishedAtUtc: null,
          deleteAfterUtc: null,
          highlightsPosted: false,
          createdAt: new Date('2026-03-20T15:00:00.000Z'),
          updatedAt: new Date('2026-03-20T15:58:00.000Z'),
        },
        {
          id: 'tracked-2',
          guildId: 'guild-1',
          sportName: 'Soccer',
          eventId: 'evt-2',
          eventName: 'Hearts vs Hibs',
          sportChannelId: 'sport-1',
          eventChannelId: 'live-2',
          status: 'cleanup_due',
          kickoffAtUtc: new Date('2026-03-20T12:00:00.000Z'),
          lastScoreSnapshot: { scoreLabel: '1-0' },
          lastStateSnapshot: { statusLabel: 'FT' },
          lastSyncedAtUtc: new Date(),
          finishedAtUtc: new Date('2026-03-20T14:45:00.000Z'),
          deleteAfterUtc: new Date('2026-03-20T17:45:00.000Z'),
          highlightsPosted: false,
          createdAt: new Date('2026-03-20T12:00:00.000Z'),
          updatedAt: new Date('2026-03-20T14:45:00.000Z'),
        },
      ]) as unknown as Awaited<ReturnType<SportsLiveEventService['listTrackedEvents']>>,
    );

    const { interaction, editReply } = createInteractionMock({
      userId: 'user-2',
      subcommand: 'live-status',
    });

    await sportsCommand.execute(interaction);

    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Tracked live events: 2'),
    });
    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Pending cleanup: 1'),
    });
    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Sync health: Healthy'),
    });
  });

  it('keeps live-status healthy when only cleanup_due rows are old', async () => {
    vi.spyOn(SportsAccessService.prototype, 'getCommandAccessState').mockResolvedValue(
      createOkResult({
        locked: false,
        allowed: true,
        activated: true,
        authorizedUserCount: 1,
      }) as Awaited<ReturnType<SportsAccessService['getCommandAccessState']>>,
    );
    vi.spyOn(SportsLiveEventService.prototype, 'listTrackedEvents').mockResolvedValue(
      createOkResult([
        {
          id: 'tracked-cleanup-1',
          guildId: 'guild-1',
          sportName: 'Soccer',
          eventId: 'evt-cleanup-1',
          eventName: 'Hearts vs Hibs',
          sportChannelId: 'sport-1',
          eventChannelId: 'live-cleanup-1',
          status: 'cleanup_due',
          kickoffAtUtc: new Date('2026-03-20T12:00:00.000Z'),
          lastScoreSnapshot: { scoreLabel: '1-0' },
          lastStateSnapshot: { statusLabel: 'FT' },
          lastSyncedAtUtc: new Date('2026-03-20T10:00:00.000Z'),
          finishedAtUtc: new Date('2026-03-20T14:45:00.000Z'),
          deleteAfterUtc: new Date('2026-03-20T17:45:00.000Z'),
          highlightsPosted: false,
          createdAt: new Date('2026-03-20T12:00:00.000Z'),
          updatedAt: new Date('2026-03-20T14:45:00.000Z'),
        },
      ]) as unknown as Awaited<ReturnType<SportsLiveEventService['listTrackedEvents']>>,
    );

    const { interaction, editReply } = createInteractionMock({
      userId: 'user-2',
      subcommand: 'live-status',
    });

    await sportsCommand.execute(interaction);

    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Pending cleanup: 1'),
    });
    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Sync health: Healthy'),
    });
  });

  it('excludes failed and finished rows from live-status tracking totals', async () => {
    vi.spyOn(SportsAccessService.prototype, 'getCommandAccessState').mockResolvedValue(
      createOkResult({
        locked: false,
        allowed: true,
        activated: true,
        authorizedUserCount: 1,
      }) as Awaited<ReturnType<SportsAccessService['getCommandAccessState']>>,
    );
    vi.spyOn(SportsLiveEventService.prototype, 'listTrackedEvents').mockResolvedValue(
      createOkResult([
        {
          id: 'tracked-live-1',
          profileId: 'profile-uk',
          guildId: 'guild-1',
          sportName: 'Soccer',
          eventId: 'evt-live-1',
          eventName: 'Rangers vs Celtic',
          sportChannelId: 'sport-1',
          eventChannelId: 'live-1',
          status: 'live',
          kickoffAtUtc: new Date('2026-03-20T15:00:00.000Z'),
          lastScoreSnapshot: { scoreLabel: '2-1' },
          lastStateSnapshot: { statusLabel: 'Live' },
          lastSyncedAtUtc: new Date('2026-03-20T15:58:00.000Z'),
          finishedAtUtc: null,
          deleteAfterUtc: null,
          highlightsPosted: false,
          createdAt: new Date('2026-03-20T15:00:00.000Z'),
          updatedAt: new Date('2026-03-20T15:58:00.000Z'),
        },
        {
          id: 'tracked-finished-1',
          profileId: 'profile-uk',
          guildId: 'guild-1',
          sportName: 'Soccer',
          eventId: 'evt-finished-1',
          eventName: 'Hearts vs Hibs',
          sportChannelId: 'sport-1',
          eventChannelId: null,
          status: 'finished',
          kickoffAtUtc: new Date('2026-03-20T12:00:00.000Z'),
          lastScoreSnapshot: { scoreLabel: '1-0' },
          lastStateSnapshot: { statusLabel: 'FT' },
          lastSyncedAtUtc: new Date('2026-03-20T13:00:00.000Z'),
          finishedAtUtc: new Date('2026-03-20T14:45:00.000Z'),
          deleteAfterUtc: new Date('2026-03-20T15:15:00.000Z'),
          highlightsPosted: true,
          createdAt: new Date('2026-03-20T12:00:00.000Z'),
          updatedAt: new Date('2026-03-20T14:45:00.000Z'),
        },
        {
          id: 'tracked-failed-1',
          profileId: 'profile-uk',
          guildId: 'guild-1',
          sportName: 'Soccer',
          eventId: 'evt-failed-1',
          eventName: 'Aberdeen vs Dundee',
          sportChannelId: 'sport-1',
          eventChannelId: null,
          status: 'failed',
          kickoffAtUtc: new Date('2026-03-20T10:00:00.000Z'),
          lastScoreSnapshot: null,
          lastStateSnapshot: { statusLabel: 'Live' },
          lastSyncedAtUtc: new Date('2026-03-20T10:05:00.000Z'),
          finishedAtUtc: null,
          deleteAfterUtc: null,
          highlightsPosted: false,
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
          updatedAt: new Date('2026-03-20T10:05:00.000Z'),
        },
      ]) as unknown as Awaited<ReturnType<SportsLiveEventService['listTrackedEvents']>>,
    );

    const { interaction, editReply } = createInteractionMock({
      userId: 'user-2',
      subcommand: 'live-status',
    });

    await sportsCommand.execute(interaction);

    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Tracked live events: 1'),
    });
    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Sync health: Degraded (1 stale tracked event)'),
    });
  });

  it('runs manual live refresh for the configured profiles', async () => {
    vi.spyOn(SportsAccessService.prototype, 'getCommandAccessState').mockResolvedValue(
      createOkResult({
        locked: false,
        allowed: true,
        activated: true,
        authorizedUserCount: 1,
      }) as Awaited<ReturnType<SportsAccessService['getCommandAccessState']>>,
    );

    const { interaction, editReply } = createInteractionMock({
      userId: 'user-2',
      subcommand: 'live-refresh',
    });

    await sportsCommand.execute(interaction);

    expect(refreshLiveEventsForGuild).toHaveBeenCalledWith({
      guild: interaction.guild,
    });
    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Live results were refreshed.'),
    });
    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Profiles refreshed: 2'),
    });
  });

  it('clears managed live event channels on demand', async () => {
    vi.spyOn(SportsAccessService.prototype, 'getCommandAccessState').mockResolvedValue(
      createOkResult({
        locked: false,
        allowed: true,
        activated: true,
        authorizedUserCount: 1,
      }) as Awaited<ReturnType<SportsAccessService['getCommandAccessState']>>,
    );

    const { interaction, editReply } = createInteractionMock({
      userId: 'user-2',
      subcommand: 'live-clear',
    });

    await sportsCommand.execute(interaction);

    expect(clearLiveEventChannelsForGuild).toHaveBeenCalledWith({
      guild: interaction.guild,
    });
    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Managed live result channels were cleared.'),
    });
    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Channels deleted: 2'),
    });
  });

  it('clears stale managed sport channels that have no listings today', async () => {
    vi.resetModules();

    vi.spyOn(SportsService.prototype, 'getGuildConfig').mockResolvedValue(
      createOkResult({
        configId: 'cfg-1',
        guildId: 'guild-1',
        enabled: true,
        managedCategoryChannelId: 'category-1',
        localTimeHhMm: '01:00',
        timezone: 'Europe/London',
        broadcastCountry: 'United Kingdom',
        nextRunAtUtc: '2026-03-21T01:00:00.000Z',
        lastRunAtUtc: null,
        lastLocalRunDate: null,
      }) as Awaited<ReturnType<SportsService['getGuildConfig']>>,
    );
    vi.spyOn(SportsService.prototype, 'listProfiles').mockResolvedValue(
      createOkResult([
        {
          profileId: 'profile-uk',
          guildId: 'guild-1',
          slug: 'default',
          label: 'UK',
          broadcastCountry: 'United Kingdom',
          dailyCategoryChannelId: 'category-1',
          liveCategoryChannelId: 'live-category-1',
          enabled: true,
        },
      ]) as Awaited<ReturnType<SportsService['listProfiles']>>,
    );
    vi.spyOn(SportsService.prototype, 'listChannelBindings').mockResolvedValue(
      createOkResult([
        {
          bindingId: 'binding-1',
          profileId: 'profile-uk',
          guildId: 'guild-1',
          sportId: 'soccer',
          sportName: 'Soccer',
          sportSlug: 'soccer',
          channelId: 'sport-1',
          createdAt: new Date('2026-03-20T12:00:00.000Z'),
          updatedAt: new Date('2026-03-20T12:00:00.000Z'),
        },
        {
          bindingId: 'binding-2',
          profileId: 'profile-uk',
          guildId: 'guild-1',
          sportId: 'rugby',
          sportName: 'Rugby Union',
          sportSlug: 'rugby-union',
          channelId: 'sport-2',
          createdAt: new Date('2026-03-20T12:00:00.000Z'),
          updatedAt: new Date('2026-03-20T12:00:00.000Z'),
        },
      ]) as unknown as Awaited<ReturnType<SportsService['listChannelBindings']>>,
    );
    vi.spyOn(SportsDataService.prototype, 'listDailyListingsForLocalDate').mockResolvedValue(
      createOkResult([
        {
          sportName: 'Soccer',
          listings: [
            {
              eventId: 'evt-1',
              eventName: 'Rangers vs Celtic',
              sportName: 'Soccer',
              startTimeUkLabel: '15:00',
              imageUrl: null,
              eventCountry: null,
              season: null,
              broadcasters: [
                {
                  channelId: 'chan-1',
                  channelName: 'Sky Sports Main Event',
                  country: 'United Kingdom',
                  logoUrl: null,
                },
              ],
            },
          ],
        },
        {
          sportName: 'Rugby Union',
          listings: [],
        },
      ]) as Awaited<ReturnType<SportsDataService['listDailyListingsForLocalDate']>>,
    );

    const soccerChannel = createManagedTextChannel('sport-1', 'soccer');
    const rugbyChannel = createManagedTextChannel('sport-2', 'rugby-union');
    const guild = {
      id: 'guild-1',
      channels: {
        fetch: vi.fn(async (channelId?: string) => {
          if (channelId === 'category-1') {
            return { id: 'category-1', type: 4 };
          }
          if (channelId === 'sport-1') {
            return soccerChannel;
          }
          if (channelId === 'sport-2') {
            return rugbyChannel;
          }
          return new Map<string, unknown>([
            ['category-1', { id: 'category-1', name: 'Sports Listings', type: 4 }],
            ['sport-1', soccerChannel],
            ['sport-2', rugbyChannel],
          ]);
        }),
      },
    };

    const { publishSportsForGuild } = (await vi.importActual('../sports-runtime.js')) as {
      publishSportsForGuild: (input: {
        guild: unknown;
        actorDiscordUserId: string | null;
      }) => Promise<unknown>;
    };
    await publishSportsForGuild({
      guild: guild as never,
      actorDiscordUserId: 'user-1',
    });

    expect(rugbyChannel.bulkDelete).toHaveBeenCalled();
    expect(rugbyChannel.send).not.toHaveBeenCalled();
    expect(soccerChannel.send).toHaveBeenCalled();
  });

  it('exposes broadcaster-country options on setup and sync', () => {
    const commandJson = sportsCommand.data.toJSON();
    const topLevelOptions = (commandJson.options ?? []) as APIApplicationCommandSubcommandOption[];
    const setup = topLevelOptions.find((option) => option.name === 'setup');
    const sync = topLevelOptions.find((option) => option.name === 'sync');
    const profiles = topLevelOptions.find((option) => option.name === 'profiles');
    const profileUpdate = topLevelOptions.find((option) => option.name === 'profile-update');
    const profileRemove = topLevelOptions.find((option) => option.name === 'profile-remove');
    const liveRefresh = topLevelOptions.find((option) => option.name === 'live-refresh');
    const liveClear = topLevelOptions.find((option) => option.name === 'live-clear');

    expect((setup?.options ?? []).some((option: APIApplicationCommandBasicOption) => option.name === 'broadcast_country')).toBe(true);
    expect((sync?.options ?? []).some((option: APIApplicationCommandBasicOption) => option.name === 'broadcast_country')).toBe(true);
    expect((setup?.options ?? []).some((option: APIApplicationCommandBasicOption) => option.name === 'live_category_name')).toBe(true);
    expect((sync?.options ?? []).some((option: APIApplicationCommandBasicOption) => option.name === 'live_category_name')).toBe(true);
    expect(profiles).toBeDefined();
    expect(liveRefresh).toBeDefined();
    expect(liveClear).toBeDefined();
    expect((profileUpdate?.options ?? []).some((option: APIApplicationCommandBasicOption) => option.name === 'profile')).toBe(true);
    expect((profileRemove?.options ?? []).some((option: APIApplicationCommandBasicOption) => option.name === 'profile')).toBe(true);
  });

  it('passes the selected broadcaster country and live category into setup sync', async () => {
    process.env.SUPER_ADMIN_DISCORD_IDS = 'owner-1';
    resetEnvForTests();

    vi.spyOn(SportsAccessService.prototype, 'getGuildActivationState').mockResolvedValue(
      createOkResult({
        activated: true,
        authorizedUserCount: 1,
      }) as Awaited<ReturnType<SportsAccessService['getGuildActivationState']>>,
    );

    const sportsRuntime = await import('../sports-runtime.js');
    const { interaction } = createInteractionMock({
      userId: 'owner-1',
      subcommand: 'setup',
      categoryName: 'Sports Listings',
      broadcastCountry: 'United States',
      liveCategoryName: 'Live Sports',
    });

    await sportsCommand.execute(interaction);

    expect(sportsRuntime.syncSportsGuildChannels).toHaveBeenCalledWith(
      expect.objectContaining({
        guild: interaction.guild,
        actorDiscordUserId: 'owner-1',
        categoryName: 'Sports Listings',
        broadcastCountry: 'United States',
        liveCategoryName: 'Live Sports',
      }),
    );
  });

  it('creates a sports profile through /sports profile-add', async () => {
    vi.spyOn(SportsAccessService.prototype, 'getCommandAccessState').mockResolvedValue(
      createOkResult({
        locked: false,
        allowed: true,
        activated: true,
        authorizedUserCount: 1,
      }) as Awaited<ReturnType<SportsAccessService['getCommandAccessState']>>,
    );

    const sportsRuntime = await import('../sports-runtime.js');
    const { interaction } = createInteractionMock({
      userId: 'user-1',
      subcommand: 'profile-add',
      label: 'USA',
      dailyCategoryName: 'USA Daily Sport',
      broadcastCountry: 'United States',
      liveCategoryName: 'USA Live Sport',
    });

    await sportsCommand.execute(interaction);

    expect(sportsRuntime.upsertSportsProfileChannels).toHaveBeenCalledWith(
      expect.objectContaining({
        guild: interaction.guild,
        actorDiscordUserId: 'user-1',
        label: 'USA',
        broadcastCountry: 'United States',
        dailyCategoryName: 'USA Daily Sport',
        liveCategoryName: 'USA Live Sport',
      }),
    );
  });

  it('lists configured sports profiles through /sports profiles', async () => {
    vi.spyOn(SportsAccessService.prototype, 'getCommandAccessState').mockResolvedValue(
      createOkResult({
        locked: false,
        allowed: true,
        activated: true,
        authorizedUserCount: 1,
      }) as Awaited<ReturnType<SportsAccessService['getCommandAccessState']>>,
    );
    vi.spyOn(SportsService.prototype, 'listProfiles').mockResolvedValue(
      createOkResult([
        {
          profileId: 'profile-uk',
          guildId: 'guild-1',
          slug: 'uk',
          label: 'UK',
          broadcastCountry: 'United Kingdom',
          dailyCategoryChannelId: 'daily-uk',
          liveCategoryChannelId: 'live-uk',
          enabled: true,
        },
        {
          profileId: 'profile-usa',
          guildId: 'guild-1',
          slug: 'usa',
          label: 'USA',
          broadcastCountry: 'United States',
          dailyCategoryChannelId: 'daily-usa',
          liveCategoryChannelId: 'live-usa',
          enabled: true,
        },
      ]) as Awaited<ReturnType<SportsService['listProfiles']>>,
    );

    const { interaction, editReply } = createInteractionMock({
      userId: 'user-1',
      subcommand: 'profiles',
    });

    await sportsCommand.execute(interaction);

    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Sports profiles for this server: 2'),
    });
    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('USA [usa] | United States'),
    });
  });

  it('updates a sports profile through /sports profile-update', async () => {
    vi.spyOn(SportsAccessService.prototype, 'getCommandAccessState').mockResolvedValue(
      createOkResult({
        locked: false,
        allowed: true,
        activated: true,
        authorizedUserCount: 1,
      }) as Awaited<ReturnType<SportsAccessService['getCommandAccessState']>>,
    );
    vi.spyOn(SportsService.prototype, 'getProfile').mockResolvedValue(
      createOkResult({
        profileId: 'profile-usa',
        guildId: 'guild-1',
        slug: 'usa',
        label: 'USA',
        broadcastCountry: 'United States',
        dailyCategoryChannelId: 'daily-usa',
        liveCategoryChannelId: 'live-usa',
        enabled: true,
      }) as Awaited<ReturnType<SportsService['getProfile']>>,
    );

    const sportsRuntime = await import('../sports-runtime.js');
    const { interaction, editReply } = createInteractionMock({
      userId: 'user-1',
      subcommand: 'profile-update',
      profile: 'usa',
      label: 'USA Prime',
      broadcastCountry: 'United States',
      dailyCategoryName: 'USA Prime Daily',
      liveCategoryName: 'USA Prime Live',
      enabled: false,
    });

    await sportsCommand.execute(interaction);

    expect(sportsRuntime.upsertSportsProfileChannels).toHaveBeenCalledWith(
      expect.objectContaining({
        guild: interaction.guild,
        actorDiscordUserId: 'user-1',
        slug: 'usa',
        label: 'USA Prime',
        broadcastCountry: 'United States',
        dailyCategoryName: 'USA Prime Daily',
        liveCategoryName: 'USA Prime Live',
        enabled: false,
      }),
    );
    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('was updated'),
    });
  });

  it('removes a sports profile through /sports profile-remove', async () => {
    vi.spyOn(SportsAccessService.prototype, 'getCommandAccessState').mockResolvedValue(
      createOkResult({
        locked: false,
        allowed: true,
        activated: true,
        authorizedUserCount: 1,
      }) as Awaited<ReturnType<SportsAccessService['getCommandAccessState']>>,
    );
    vi.spyOn(SportsService.prototype, 'removeProfile').mockResolvedValue(
      createOkResult({
        profileId: 'profile-usa',
        guildId: 'guild-1',
        slug: 'usa',
        label: 'USA',
        broadcastCountry: 'United States',
        dailyCategoryChannelId: 'daily-usa',
        liveCategoryChannelId: 'live-usa',
        enabled: true,
      }) as Awaited<ReturnType<SportsService['removeProfile']>>,
    );
    vi.spyOn(SportsService.prototype, 'getGuildConfig').mockResolvedValue(
      createOkResult({
        configId: 'cfg-1',
        guildId: 'guild-1',
        enabled: true,
        managedCategoryChannelId: 'daily-usa',
        liveCategoryChannelId: 'live-usa',
        localTimeHhMm: '00:01',
        timezone: 'Europe/London',
        broadcastCountry: 'United States',
        nextRunAtUtc: '2026-03-21T00:01:00.000Z',
        lastRunAtUtc: null,
        lastLocalRunDate: null,
      }) as Awaited<ReturnType<SportsService['getGuildConfig']>>,
    );
    vi.spyOn(SportsService.prototype, 'listProfiles').mockResolvedValue(
      createOkResult([
        {
          profileId: 'profile-uk',
          guildId: 'guild-1',
          slug: 'uk',
          label: 'UK',
          broadcastCountry: 'United Kingdom',
          dailyCategoryChannelId: 'daily-uk',
          liveCategoryChannelId: 'live-uk',
          enabled: true,
        },
      ]) as Awaited<ReturnType<SportsService['listProfiles']>>,
    );
    vi.spyOn(SportsService.prototype, 'upsertGuildConfig').mockResolvedValue(
      createOkResult({
        configId: 'cfg-1',
        guildId: 'guild-1',
        enabled: true,
        managedCategoryChannelId: 'daily-uk',
        liveCategoryChannelId: 'live-uk',
        localTimeHhMm: '00:01',
        timezone: 'Europe/London',
        broadcastCountry: 'United Kingdom',
        nextRunAtUtc: '2026-03-21T00:01:00.000Z',
        lastRunAtUtc: null,
        lastLocalRunDate: null,
      }) as Awaited<ReturnType<SportsService['upsertGuildConfig']>>,
    );

    const { interaction, editReply } = createInteractionMock({
      userId: 'user-1',
      subcommand: 'profile-remove',
      profile: 'usa',
    });

    await sportsCommand.execute(interaction);

    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('was removed'),
    });
    expect(SportsService.prototype.upsertGuildConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-1',
        managedCategoryChannelId: 'daily-uk',
        liveCategoryChannelId: 'live-uk',
        broadcastCountry: 'United Kingdom',
      }),
    );
  });
});
