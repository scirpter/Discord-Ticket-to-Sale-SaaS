import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@voodoo/core', () => {
  class SportsService {
    public async getGuildConfig(): Promise<never> {
      throw new Error('Mock getGuildConfig not implemented');
    }

    public async upsertGuildConfig(): Promise<never> {
      throw new Error('Mock upsertGuildConfig not implemented');
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

    public async listDailyListingsForLocalDateAcrossCountries(): Promise<never> {
      throw new Error('Mock listDailyListingsForLocalDateAcrossCountries not implemented');
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

function createCategoryChannel(id: string, name: string) {
  return {
    id,
    name,
    type: 4,
    setName: vi.fn(async () => undefined),
  };
}

function createManagedTextChannel(id: string, name: string, topic: string) {
  return {
    id,
    name,
    topic,
    type: 0,
    parentId: 'category-1',
    send: vi.fn(async () => undefined),
    edit: vi.fn(async () => undefined),
    bulkDelete: vi.fn(async () => undefined),
    messages: {
      fetch: vi.fn(async () => ({ size: 0 })),
    },
  };
}

describe('sports runtime country handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults setup to shared United Kingdom and United States countries when no override is supplied', async () => {
    vi.spyOn(SportsService.prototype, 'getGuildConfig').mockResolvedValue(
      createOkResult(null) as Awaited<ReturnType<SportsService['getGuildConfig']>>,
    );
    const upsertGuildConfig = vi.spyOn(SportsService.prototype, 'upsertGuildConfig').mockResolvedValue(
      createOkResult({
        configId: 'cfg-1',
        guildId: 'guild-1',
        enabled: true,
        managedCategoryChannelId: 'category-1',
        liveCategoryChannelId: null,
        localTimeHhMm: '00:01',
        timezone: 'Europe/London',
        broadcastCountry: 'United Kingdom',
        broadcastCountries: ['United Kingdom', 'United States'],
        nextRunAtUtc: '2026-03-21T00:01:00.000Z',
        lastRunAtUtc: null,
        lastLocalRunDate: null,
      }) as Awaited<ReturnType<SportsService['upsertGuildConfig']>>,
    );
    vi.spyOn(SportsService.prototype, 'listChannelBindings').mockResolvedValue(
      createOkResult([]) as unknown as Awaited<ReturnType<SportsService['listChannelBindings']>>,
    );
    const listDailyListingsAcrossCountries = vi
      .spyOn(SportsDataService.prototype, 'listDailyListingsForLocalDateAcrossCountries')
      .mockResolvedValue(
        createOkResult({
          data: [],
          degraded: false,
          failedCountries: [],
          successfulCountries: ['United Kingdom', 'United States'],
        }) as unknown as Awaited<
          ReturnType<SportsDataService['listDailyListingsForLocalDateAcrossCountries']>
        >,
      );

    const category = createCategoryChannel('category-1', 'Sports Listings');
    const guild = {
      id: 'guild-1',
      channels: {
        fetch: vi.fn(async (channelId?: string) => {
          if (channelId === 'category-1') {
            return category;
          }

          return new Map<string, unknown>();
        }),
        create: vi.fn(async () => category),
      },
    };

    await syncSportsGuildChannels({
      guild: guild as never,
      actorDiscordUserId: 'user-1',
      categoryName: null,
    });

    expect(upsertGuildConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        timezone: 'Europe/London',
        localTimeHhMm: '00:01',
        broadcastCountries: ['United Kingdom', 'United States'],
      }),
    );
    expect(listDailyListingsAcrossCountries).toHaveBeenCalledWith({
      localDate: '2026-03-20',
      timezone: 'Europe/London',
      broadcastCountries: ['United Kingdom', 'United States'],
    });
  });

  it('publishes shared-country header and topic copy from the multi-country daily listings payload', async () => {
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
        broadcastCountries: ['United Kingdom', 'United States'],
        nextRunAtUtc: '2026-03-21T00:01:00.000Z',
        lastRunAtUtc: null,
        lastLocalRunDate: null,
      }) as Awaited<ReturnType<SportsService['getGuildConfig']>>,
    );
    vi.spyOn(SportsService.prototype, 'listChannelBindings').mockResolvedValue(
      createOkResult([]) as unknown as Awaited<ReturnType<SportsService['listChannelBindings']>>,
    );
    const upsertChannelBinding = vi
      .spyOn(SportsService.prototype, 'upsertChannelBinding')
      .mockImplementation(async (input) =>
        createOkResult({
          bindingId: 'binding-1',
          guildId: input.guildId,
          sportId: input.sportId,
          sportName: input.sportName,
          sportSlug: input.sportSlug,
          channelId: input.channelId,
        }) as Awaited<ReturnType<SportsService['upsertChannelBinding']>>,
      );
    const listDailyListingsAcrossCountries = vi
      .spyOn(SportsDataService.prototype, 'listDailyListingsForLocalDateAcrossCountries')
      .mockResolvedValue(
        createOkResult({
          data: [
            {
              sportName: 'Soccer',
              listings: [
                {
                  eventId: 'event-1',
                  sportName: 'Soccer',
                  eventName: 'Rangers vs Celtic',
                  season: '2025-2026',
                  eventCountry: 'Scotland',
                  startTimeUtc: '2026-03-20T15:00:00.000Z',
                  startTimeUkLabel: '15:00',
                  imageUrl: null,
                  broadcasters: [
                    {
                      channelId: 'uk-1',
                      channelName: 'Sky Sports Main Event',
                      country: 'United Kingdom',
                      logoUrl: null,
                    },
                  ],
                },
              ],
            },
          ],
          degraded: true,
          failedCountries: ['United States'],
          successfulCountries: ['United Kingdom'],
        }) as unknown as Awaited<
          ReturnType<SportsDataService['listDailyListingsForLocalDateAcrossCountries']>
        >,
      );

    const category = createCategoryChannel('category-1', 'Sports Listings');
    const managedChannels = new Map<string, ReturnType<typeof createManagedTextChannel>>();
    let managedChannelCount = 0;
    const guild = {
      id: 'guild-1',
      channels: {
        fetch: vi.fn(async (channelId?: string) => {
          if (channelId === 'category-1') {
            return category;
          }
          if (channelId) {
            return managedChannels.get(channelId) ?? null;
          }

          return new Map<string, unknown>([
            ['category-1', category],
            ...managedChannels.entries(),
          ]);
        }),
        create: vi.fn(async (input: { name: string; type: number; topic: string }) => {
          managedChannelCount += 1;
          const channel = createManagedTextChannel(`sport-${managedChannelCount}`, input.name, input.topic);
          managedChannels.set(channel.id, channel);
          return channel;
        }),
      },
    };

    const result = await publishSportsForGuild({
      guild: guild as never,
      actorDiscordUserId: 'user-1',
    });

    expect(result).toEqual({
      publishedChannelCount: 1,
      listingCount: 1,
      createdChannelCount: 1,
    });
    expect(listDailyListingsAcrossCountries).toHaveBeenCalledWith({
      localDate: '2026-03-20',
      timezone: 'Europe/London',
      broadcastCountries: ['United Kingdom', 'United States'],
    });
    expect(guild.channels.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'soccer',
        topic:
          'Managed by the sports worker. Daily TV listings currently reflect tracked broadcasters in United Kingdom. Coverage is degraded because data is unavailable for United States. Refreshes automatically at 00:01 (Europe/London).',
      }),
    );

    const createdChannel = managedChannels.get('sport-1');
    expect(createdChannel).toBeDefined();
    expect(upsertChannelBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        sportName: 'Soccer',
        channelId: 'sport-1',
      }),
    );
    expect(createdChannel?.send).toHaveBeenCalledWith({
      content: expect.stringContaining(
        'TV listings for Friday, 20 March 2026 from tracked broadcasters in United Kingdom.',
      ),
    });
    expect(createdChannel?.send).toHaveBeenCalledWith({
      content: expect.stringContaining(
        'Tracked broadcaster countries in this update: United Kingdom.',
      ),
    });
    expect(createdChannel?.send).toHaveBeenCalledWith({
      content: expect.stringContaining(
        'Coverage is degraded. Missing broadcaster countries: United States.',
      ),
    });
    expect(createdChannel?.send).toHaveBeenCalledWith({
      content: expect.not.stringContaining('Tracked broadcaster country:'),
    });
  });

  it('does not clear bound channels for sports absent from a degraded payload', async () => {
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
        broadcastCountries: ['United Kingdom', 'United States'],
        nextRunAtUtc: '2026-03-21T00:01:00.000Z',
        lastRunAtUtc: null,
        lastLocalRunDate: null,
      }) as Awaited<ReturnType<SportsService['getGuildConfig']>>,
    );
    vi.spyOn(SportsService.prototype, 'listChannelBindings').mockResolvedValue(
      createOkResult([
        {
          bindingId: 'binding-1',
          guildId: 'guild-1',
          sportId: null,
          sportName: 'Soccer',
          sportSlug: 'soccer',
          channelId: 'sport-1',
        },
        {
          bindingId: 'binding-2',
          guildId: 'guild-1',
          sportId: null,
          sportName: 'Rugby Union',
          sportSlug: 'rugby-union',
          channelId: 'sport-2',
        },
      ]) as unknown as Awaited<ReturnType<SportsService['listChannelBindings']>>,
    );
    vi.spyOn(SportsDataService.prototype, 'listDailyListingsForLocalDateAcrossCountries').mockResolvedValue(
      createOkResult({
        data: [
          {
            sportName: 'Soccer',
            listings: [
              {
                eventId: 'event-1',
                sportName: 'Soccer',
                eventName: 'Rangers vs Celtic',
                season: '2025-2026',
                eventCountry: 'Scotland',
                startTimeUtc: '2026-03-20T15:00:00.000Z',
                startTimeUkLabel: '15:00',
                imageUrl: null,
                broadcasters: [
                  {
                    channelId: 'uk-1',
                    channelName: 'Sky Sports Main Event',
                    country: 'United Kingdom',
                    logoUrl: null,
                  },
                ],
              },
            ],
          },
        ],
        degraded: true,
        failedCountries: ['United States'],
        successfulCountries: ['United Kingdom'],
      }) as unknown as Awaited<
        ReturnType<SportsDataService['listDailyListingsForLocalDateAcrossCountries']>
      >,
    );

    const category = createCategoryChannel('category-1', 'Sports Listings');
    const soccerChannel = createManagedTextChannel('sport-1', 'soccer', 'old topic');
    const rugbyChannel = createManagedTextChannel('sport-2', 'rugby-union', 'old topic');
    const guild = {
      id: 'guild-1',
      channels: {
        fetch: vi.fn(async (channelId?: string) => {
          if (channelId === 'category-1') {
            return category;
          }
          if (channelId === 'sport-1') {
            return soccerChannel;
          }
          if (channelId === 'sport-2') {
            return rugbyChannel;
          }

          return new Map<string, unknown>([
            ['category-1', category],
            ['sport-1', soccerChannel],
            ['sport-2', rugbyChannel],
          ]);
        }),
      },
    };

    const result = await publishSportsForGuild({
      guild: guild as never,
      actorDiscordUserId: 'user-1',
    });

    expect(result).toEqual({
      publishedChannelCount: 1,
      listingCount: 1,
      createdChannelCount: 0,
    });
    expect(soccerChannel.messages.fetch).toHaveBeenCalled();
    expect(rugbyChannel.messages.fetch).not.toHaveBeenCalled();
    expect(rugbyChannel.send).not.toHaveBeenCalled();
    expect(rugbyChannel.edit).toHaveBeenCalledWith({
      topic:
        'Managed by the sports worker. Daily TV listings currently reflect tracked broadcasters in United Kingdom. Coverage is degraded because data is unavailable for United States. Refreshes automatically at 00:01 (Europe/London).',
    });
  });

  it('stores a dedicated live event category when one is configured during sync', async () => {
    vi.spyOn(SportsService.prototype, 'getGuildConfig').mockResolvedValue(
      createOkResult(null) as Awaited<ReturnType<SportsService['getGuildConfig']>>,
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
        broadcastCountries: ['United Kingdom', 'United States'],
        nextRunAtUtc: '2026-03-21T00:01:00.000Z',
        lastRunAtUtc: null,
        lastLocalRunDate: null,
      }) as Awaited<ReturnType<SportsService['upsertGuildConfig']>>,
    );
    vi.spyOn(SportsService.prototype, 'listChannelBindings').mockResolvedValue(
      createOkResult([]) as unknown as Awaited<ReturnType<SportsService['listChannelBindings']>>,
    );
    vi.spyOn(SportsDataService.prototype, 'listDailyListingsForLocalDateAcrossCountries').mockResolvedValue(
      createOkResult({
        data: [],
        degraded: false,
        failedCountries: [],
        successfulCountries: ['United Kingdom', 'United States'],
      }) as unknown as Awaited<
        ReturnType<SportsDataService['listDailyListingsForLocalDateAcrossCountries']>
      >,
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
});
