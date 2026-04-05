import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@voodoo/core', () => {
  class SportsService {
    public async getGuildConfig(): Promise<never> {
      throw new Error('Mock getGuildConfig not implemented');
    }

    public async listProfiles(): Promise<never> {
      throw new Error('Mock listProfiles not implemented');
    }

    public async upsertGuildConfig(): Promise<never> {
      throw new Error('Mock upsertGuildConfig not implemented');
    }

    public async upsertProfile(): Promise<never> {
      throw new Error('Mock upsertProfile not implemented');
    }

    public async listChannelBindings(): Promise<never> {
      throw new Error('Mock listChannelBindings not implemented');
    }

    public async upsertChannelBinding(): Promise<never> {
      throw new Error('Mock upsertChannelBinding not implemented');
    }
  }

  class SportsDataService {
    public async listDailyListingsForLocalDate(): Promise<never> {
      throw new Error('Mock listDailyListingsForLocalDate not implemented');
    }
  }

  class SportsAccessService {}

  return {
    AppError: class AppError extends Error {},
    SportsAccessService,
    SportsDataService,
    SportsService,
    getEnv: () => ({
      SPORTS_DEFAULT_PUBLISH_TIME: '00:01',
      SPORTS_DEFAULT_TIMEZONE: 'Europe/London',
      SPORTS_BROADCAST_COUNTRY: 'United Kingdom',
    }),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    resolveSportsLocalDate: () => '2026-03-20',
  };
});

import { SportsDataService, SportsService } from '@voodoo/core';
import { publishSportsForGuild, syncSportsGuildChannels } from './sports-runtime.js';

function createOkResult<T>(value: T): { isErr: () => false; isOk: () => true; value: T } {
  return {
    isErr: () => false,
    isOk: () => true,
    value,
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

describe('sports runtime country handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves the existing broadcaster country during sync when no override is provided', async () => {
    vi.spyOn(SportsService.prototype, 'getGuildConfig').mockResolvedValue(
      createOkResult({
        configId: 'cfg-1',
        guildId: 'guild-1',
        enabled: true,
        managedCategoryChannelId: 'category-1',
        localTimeHhMm: '00:01',
        timezone: 'America/New_York',
        broadcastCountry: 'United States',
        nextRunAtUtc: '2026-03-21T04:01:00.000Z',
        lastRunAtUtc: null,
        lastLocalRunDate: null,
      }) as Awaited<ReturnType<SportsService['getGuildConfig']>>,
    );
    vi.spyOn(SportsService.prototype, 'listProfiles').mockResolvedValue(
      createOkResult([]) as unknown as Awaited<ReturnType<SportsService['listProfiles']>>,
    );
    vi.spyOn(SportsService.prototype, 'upsertProfile').mockResolvedValue(
      createOkResult({
        profileId: 'profile-default',
        guildId: 'guild-1',
        slug: 'default',
        label: 'United States',
        broadcastCountry: 'United States',
        dailyCategoryChannelId: 'category-1',
        liveCategoryChannelId: null,
        enabled: true,
      }) as Awaited<ReturnType<SportsService['upsertProfile']>>,
    );
    const upsertGuildConfig = vi.spyOn(SportsService.prototype, 'upsertGuildConfig').mockResolvedValue(
      createOkResult({
        configId: 'cfg-1',
        guildId: 'guild-1',
        enabled: true,
        managedCategoryChannelId: 'category-1',
        localTimeHhMm: '00:01',
        timezone: 'America/New_York',
        broadcastCountry: 'United States',
        nextRunAtUtc: '2026-03-21T04:01:00.000Z',
        lastRunAtUtc: null,
        lastLocalRunDate: null,
      }) as Awaited<ReturnType<SportsService['upsertGuildConfig']>>,
    );
    vi.spyOn(SportsService.prototype, 'listChannelBindings').mockResolvedValue(
      createOkResult([]) as unknown as Awaited<ReturnType<SportsService['listChannelBindings']>>,
    );
    vi.spyOn(SportsDataService.prototype, 'listDailyListingsForLocalDate').mockResolvedValue(
      createOkResult([]) as unknown as Awaited<ReturnType<SportsDataService['listDailyListingsForLocalDate']>>,
    );

    const guild = {
      id: 'guild-1',
      channels: {
        fetch: vi.fn(async (channelId?: string) => {
          if (channelId === 'category-1') {
            return { id: 'category-1', name: 'Sports Listings', type: 4, setName: vi.fn(async () => undefined) };
          }

          return new Map<string, unknown>([['category-1', { id: 'category-1', name: 'Sports Listings', type: 4 }]]);
        }),
        create: vi.fn(async () => ({ id: 'category-1', name: 'Sports Listings', type: 4 })),
      },
    };

    await syncSportsGuildChannels({
      guild: guild as never,
      actorDiscordUserId: 'user-1',
      categoryName: null,
    });

    expect(upsertGuildConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        timezone: 'America/New_York',
        localTimeHhMm: '00:01',
        broadcastCountry: 'United States',
      }),
    );
  });

  it('stores a dedicated live event category when one is configured during sync', async () => {
    vi.spyOn(SportsService.prototype, 'getGuildConfig').mockResolvedValue(
      createOkResult(null) as Awaited<ReturnType<SportsService['getGuildConfig']>>,
    );
    vi.spyOn(SportsService.prototype, 'listProfiles').mockResolvedValue(
      createOkResult([]) as unknown as Awaited<ReturnType<SportsService['listProfiles']>>,
    );
    vi.spyOn(SportsService.prototype, 'upsertProfile').mockResolvedValue(
      createOkResult({
        profileId: 'profile-default',
        guildId: 'guild-1',
        slug: 'default',
        label: 'United Kingdom',
        broadcastCountry: 'United Kingdom',
        dailyCategoryChannelId: 'category-1',
        liveCategoryChannelId: 'live-category-1',
        enabled: true,
      }) as Awaited<ReturnType<SportsService['upsertProfile']>>,
    );
    const upsertGuildConfig = vi.spyOn(SportsService.prototype, 'upsertGuildConfig').mockResolvedValue(
      createOkResult({
        configId: 'cfg-1',
        guildId: 'guild-1',
        enabled: true,
        managedCategoryChannelId: 'category-1',
        liveCategoryChannelId: 'live-category-1',
        localTimeHhMm: '00:01',
        timezone: 'Europe/London',
        broadcastCountry: 'United Kingdom',
        nextRunAtUtc: '2026-03-21T00:01:00.000Z',
        lastRunAtUtc: null,
        lastLocalRunDate: null,
      }) as Awaited<ReturnType<SportsService['upsertGuildConfig']>>,
    );
    vi.spyOn(SportsService.prototype, 'listChannelBindings').mockResolvedValue(
      createOkResult([]) as unknown as Awaited<ReturnType<SportsService['listChannelBindings']>>,
    );
    vi.spyOn(SportsDataService.prototype, 'listDailyListingsForLocalDate').mockResolvedValue(
      createOkResult([]) as unknown as Awaited<ReturnType<SportsDataService['listDailyListingsForLocalDate']>>,
    );

    const createdCategories: Array<{ name: string; type: number }> = [];
    const guild = {
      id: 'guild-1',
      channels: {
        fetch: vi.fn(async () => new Map<string, unknown>()),
        create: vi.fn(async (input: { name: string; type: number }) => {
          createdCategories.push(input);
          if (input.name === 'Sports Listings') {
            return { id: 'category-1', name: input.name, type: 4 };
          }

          return { id: 'live-category-1', name: input.name, type: 4 };
        }),
      },
    };

    await syncSportsGuildChannels({
      guild: guild as never,
      actorDiscordUserId: 'user-1',
      categoryName: 'Sports Listings',
      liveCategoryName: 'Live Sports',
    });

    expect(createdCategories).toHaveLength(2);
    expect(upsertGuildConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        managedCategoryChannelId: 'category-1',
        liveCategoryChannelId: 'live-category-1',
      }),
    );
  });

  it('keeps the existing daily category name when sync runs without a rename override', async () => {
    vi.spyOn(SportsService.prototype, 'getGuildConfig').mockResolvedValue(
      createOkResult({
        configId: 'cfg-1',
        guildId: 'guild-1',
        enabled: true,
        managedCategoryChannelId: 'category-1',
        liveCategoryChannelId: null,
        localTimeHhMm: '00:01',
        timezone: 'Europe/London',
        broadcastCountry: 'United Kingdom',
        nextRunAtUtc: '2026-03-21T00:01:00.000Z',
        lastRunAtUtc: null,
        lastLocalRunDate: null,
      }) as Awaited<ReturnType<SportsService['getGuildConfig']>>,
    );
    vi.spyOn(SportsService.prototype, 'listProfiles').mockResolvedValue(
      createOkResult([
        {
          profileId: 'profile-default',
          guildId: 'guild-1',
          slug: 'default',
          label: 'United Kingdom',
          broadcastCountry: 'United Kingdom',
          dailyCategoryChannelId: 'category-1',
          liveCategoryChannelId: null,
          enabled: true,
        },
      ]) as Awaited<ReturnType<SportsService['listProfiles']>>,
    );
    vi.spyOn(SportsService.prototype, 'upsertProfile').mockResolvedValue(
      createOkResult({
        profileId: 'profile-default',
        guildId: 'guild-1',
        slug: 'default',
        label: 'United Kingdom',
        broadcastCountry: 'United Kingdom',
        dailyCategoryChannelId: 'category-1',
        liveCategoryChannelId: null,
        enabled: true,
      }) as Awaited<ReturnType<SportsService['upsertProfile']>>,
    );
    vi.spyOn(SportsService.prototype, 'upsertGuildConfig').mockResolvedValue(
      createOkResult({
        configId: 'cfg-1',
        guildId: 'guild-1',
        enabled: true,
        managedCategoryChannelId: 'category-1',
        liveCategoryChannelId: null,
        localTimeHhMm: '00:01',
        timezone: 'Europe/London',
        broadcastCountry: 'United Kingdom',
        nextRunAtUtc: '2026-03-21T00:01:00.000Z',
        lastRunAtUtc: null,
        lastLocalRunDate: null,
      }) as Awaited<ReturnType<SportsService['upsertGuildConfig']>>,
    );
    vi.spyOn(SportsService.prototype, 'listChannelBindings').mockResolvedValue(
      createOkResult([]) as unknown as Awaited<ReturnType<SportsService['listChannelBindings']>>,
    );
    vi.spyOn(SportsDataService.prototype, 'listDailyListingsForLocalDate').mockResolvedValue(
      createOkResult([]) as unknown as Awaited<ReturnType<SportsDataService['listDailyListingsForLocalDate']>>,
    );

    const setName = vi.fn(async () => undefined);
    const guild = {
      id: 'guild-1',
      channels: {
        fetch: vi.fn(async (channelId?: string) => {
          if (channelId === 'category-1') {
            return { id: 'category-1', name: 'UK Daily Sport', type: 4, setName };
          }

          return new Map<string, unknown>([['category-1', { id: 'category-1', name: 'UK Daily Sport', type: 4 }]]);
        }),
        create: vi.fn(async () => ({ id: 'category-1', name: 'UK Daily Sport', type: 4 })),
      },
    };

    await syncSportsGuildChannels({
      guild: guild as never,
      actorDiscordUserId: 'user-1',
      categoryName: null,
    });

    expect(setName).not.toHaveBeenCalled();
  });

  it('publishes daily listings separately for uk and usa profiles', async () => {
    vi.spyOn(SportsService.prototype, 'getGuildConfig').mockResolvedValue(
      createOkResult({
        configId: 'cfg-1',
        guildId: 'guild-1',
        enabled: true,
        managedCategoryChannelId: null,
        liveCategoryChannelId: null,
        localTimeHhMm: '00:01',
        timezone: 'Europe/London',
        broadcastCountry: 'United Kingdom',
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
    vi.spyOn(SportsService.prototype, 'listChannelBindings').mockImplementation(
      async (input: { profileId?: string | null }) =>
        createOkResult(
          input.profileId === 'profile-uk'
            ? [
                {
                  bindingId: 'binding-uk',
                  profileId: 'profile-uk',
                  guildId: 'guild-1',
                  sportId: 'soccer',
                  sportName: 'Soccer',
                  sportSlug: 'soccer',
                  channelId: 'sport-uk',
                },
              ]
            : [
                {
                  bindingId: 'binding-usa',
                  profileId: 'profile-usa',
                  guildId: 'guild-1',
                  sportId: 'basketball',
                  sportName: 'Basketball',
                  sportSlug: 'basketball',
                  channelId: 'sport-usa',
                },
              ],
        ) as Awaited<ReturnType<SportsService['listChannelBindings']>>,
    );
    vi.spyOn(SportsDataService.prototype, 'listDailyListingsForLocalDate').mockImplementation(
      async (input: { broadcastCountry: string }) =>
        createOkResult(
          input.broadcastCountry === 'United Kingdom'
            ? [
                {
                  sportName: 'Soccer',
                  listings: [
                    {
                      eventId: 'evt-uk-1',
                      eventName: 'Rangers vs Celtic',
                      sportName: 'Soccer',
                      startTimeUkLabel: '15:00',
                      imageUrl: null,
                      eventCountry: 'United Kingdom',
                      season: null,
                      broadcasters: [
                        {
                          channelId: 'chan-uk-1',
                          channelName: 'Sky Sports',
                          country: 'United Kingdom',
                          logoUrl: null,
                        },
                      ],
                    },
                  ],
                },
              ]
            : [
                {
                  sportName: 'Basketball',
                  listings: [
                    {
                      eventId: 'evt-usa-1',
                      eventName: 'Lakers vs Celtics',
                      sportName: 'Basketball',
                      startTimeUkLabel: '20:00',
                      imageUrl: null,
                      eventCountry: 'United States',
                      season: null,
                      broadcasters: [
                        {
                          channelId: 'chan-usa-1',
                          channelName: 'ESPN',
                          country: 'United States',
                          logoUrl: null,
                        },
                      ],
                    },
                  ],
                },
              ],
        ) as Awaited<ReturnType<SportsDataService['listDailyListingsForLocalDate']>>,
    );

    const ukChannel = createManagedTextChannel('sport-uk', 'soccer');
    const usaChannel = createManagedTextChannel('sport-usa', 'basketball');
    const guild = {
      id: 'guild-1',
      channels: {
        fetch: vi.fn(async (channelId?: string) => {
          if (channelId === 'daily-uk') {
            return { id: 'daily-uk', type: 4 };
          }
          if (channelId === 'daily-usa') {
            return { id: 'daily-usa', type: 4 };
          }
          if (channelId === 'sport-uk') {
            return ukChannel;
          }
          if (channelId === 'sport-usa') {
            return usaChannel;
          }

          return new Map<string, unknown>([
            ['daily-uk', { id: 'daily-uk', name: 'UK Daily Sport', type: 4 }],
            ['daily-usa', { id: 'daily-usa', name: 'USA Daily Sport', type: 4 }],
            ['sport-uk', ukChannel],
            ['sport-usa', usaChannel],
          ]);
        }),
      },
    };

    const result = await publishSportsForGuild({
      guild: guild as never,
      actorDiscordUserId: 'user-1',
    });

    expect(result.publishedProfileCount).toBe(2);
    expect(ukChannel.send).toHaveBeenCalled();
    expect(usaChannel.send).toHaveBeenCalled();
  });
});
