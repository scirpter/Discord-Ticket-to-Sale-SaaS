import { afterEach, describe, expect, it, vi } from 'vitest';

import { SportsService } from '../src/services/sports-service.js';

type SportsProfileRecord = {
  profileId: string;
  guildId: string;
  slug: string;
  label: string;
  broadcastCountry: string;
  dailyCategoryChannelId: string | null;
  liveCategoryChannelId: string | null;
  enabled: boolean;
};

type SportsRepositoryLike = {
  getGuildConfig?: ReturnType<typeof vi.fn>;
  listProfiles?: ReturnType<typeof vi.fn>;
};

function createServiceWithMockRepository(repository: SportsRepositoryLike): SportsService {
  const service = new SportsService();
  Object.defineProperty(service, 'sportsRepository', {
    value: repository,
    configurable: true,
    writable: true,
  });
  return service;
}

describe('SportsService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists migrated sports profiles for a guild that previously had one guild-wide sports config', async () => {
    const repository: SportsRepositoryLike = {
      listProfiles: vi.fn().mockResolvedValue([
        {
          profileId: 'profile-uk',
          guildId: 'guild-1',
          slug: 'uk',
          label: 'UK',
          broadcastCountry: 'United Kingdom',
          dailyCategoryChannelId: 'daily-uk',
          liveCategoryChannelId: 'live-uk',
          enabled: true,
        } satisfies SportsProfileRecord,
      ]),
    };
    const service = createServiceWithMockRepository(repository);

    const result = await service.listProfiles({ guildId: 'guild-1' });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    expect(repository.listProfiles).toHaveBeenCalledWith({ guildId: 'guild-1' });
    expect(result.value).toEqual([
      expect.objectContaining({
        profileId: 'profile-uk',
        slug: 'uk',
        broadcastCountry: 'United Kingdom',
        dailyCategoryChannelId: 'daily-uk',
        liveCategoryChannelId: 'live-uk',
      }),
    ]);
  });

  it('exposes broadcast countries on the guild config summary', async () => {
    const repository: SportsRepositoryLike = {
      getGuildConfig: vi.fn().mockResolvedValue({
        id: 'config-1',
        guildId: 'guild-1',
        enabled: true,
        managedCategoryChannelId: 'category-1',
        liveCategoryChannelId: 'live-category-1',
        localTimeHhmm: '09:30',
        timezone: 'Europe/London',
        broadcastCountry: 'United Kingdom',
        broadcastCountries: ['United Kingdom', 'United States'],
        nextRunAtUtc: new Date('2026-04-14T08:30:00.000Z'),
        lastRunAtUtc: null,
        lastLocalRunDate: null,
        updatedByDiscordUserId: 'user-1',
        createdAt: new Date('2026-04-14T08:00:00.000Z'),
        updatedAt: new Date('2026-04-14T08:00:00.000Z'),
      }),
    };
    const service = createServiceWithMockRepository(repository);

    const result = await service.getGuildConfig({ guildId: 'guild-1' });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    expect(repository.getGuildConfig).toHaveBeenCalledWith('guild-1');
    expect(result.value).toMatchObject({
      guildId: 'guild-1',
      broadcastCountries: ['United Kingdom', 'United States'],
    });
  });
});
