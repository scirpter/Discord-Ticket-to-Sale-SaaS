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
  listProfiles: ReturnType<typeof vi.fn>;
  upsertProfile: ReturnType<typeof vi.fn>;
  deleteProfile: ReturnType<typeof vi.fn>;
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
      upsertProfile: vi.fn(),
      deleteProfile: vi.fn(),
    };
    const service = createServiceWithMockRepository(repository);

    const result = await service.listProfiles({ guildId: 'guild-1' });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    expect(repository.listProfiles).toHaveBeenCalledWith('guild-1');
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

  it('creates a sports profile and returns it from listProfiles', async () => {
    const profile = {
      profileId: 'profile-usa',
      guildId: 'guild-1',
      slug: 'usa',
      label: 'USA',
      broadcastCountry: 'United States',
      dailyCategoryChannelId: 'daily-usa',
      liveCategoryChannelId: 'live-usa',
      enabled: true,
    } satisfies SportsProfileRecord;
    const repository: SportsRepositoryLike = {
      listProfiles: vi.fn().mockResolvedValue([profile]),
      upsertProfile: vi.fn().mockResolvedValue(profile),
      deleteProfile: vi.fn(),
    };
    const service = createServiceWithMockRepository(repository);

    const created = await service.upsertProfile({
      guildId: 'guild-1',
      slug: 'usa',
      label: 'USA',
      broadcastCountry: 'United States',
      dailyCategoryChannelId: 'daily-usa',
      liveCategoryChannelId: 'live-usa',
      enabled: true,
      actorDiscordUserId: 'user-1',
    });

    expect(created.isOk()).toBe(true);
    expect(repository.upsertProfile).toHaveBeenCalledWith({
      guildId: 'guild-1',
      slug: 'usa',
      label: 'USA',
      broadcastCountry: 'United States',
      dailyCategoryChannelId: 'daily-usa',
      liveCategoryChannelId: 'live-usa',
      enabled: true,
      actorDiscordUserId: 'user-1',
    });

    const profiles = await service.listProfiles({ guildId: 'guild-1' });

    expect(profiles.isOk()).toBe(true);
    if (created.isErr() || profiles.isErr()) {
      return;
    }

    expect(created.value).toEqual(expect.objectContaining({ slug: 'usa' }));
    expect(profiles.value).toEqual([
      expect.objectContaining({
        slug: 'usa',
        broadcastCountry: 'United States',
      }),
    ]);
  });

  it('resolves profiles by slug and removes them with their profile id', async () => {
    const profile = {
      profileId: 'profile-usa',
      guildId: 'guild-1',
      slug: 'usa',
      label: 'USA',
      broadcastCountry: 'United States',
      dailyCategoryChannelId: 'daily-usa',
      liveCategoryChannelId: 'live-usa',
      enabled: true,
    } satisfies SportsProfileRecord;
    const repository: SportsRepositoryLike = {
      listProfiles: vi.fn().mockResolvedValue([profile]),
      upsertProfile: vi.fn(),
      deleteProfile: vi.fn().mockResolvedValue(undefined),
    };
    const service = createServiceWithMockRepository(repository);

    const resolved = await service.getProfile({
      guildId: 'guild-1',
      selector: 'usa',
    });

    expect(resolved.isOk()).toBe(true);
    if (resolved.isErr()) {
      return;
    }

    expect(resolved.value).toEqual(expect.objectContaining({ profileId: 'profile-usa' }));

    const removed = await service.removeProfile({
      guildId: 'guild-1',
      selector: 'USA',
    });

    expect(removed.isOk()).toBe(true);
    expect(repository.deleteProfile).toHaveBeenCalledWith({
      guildId: 'guild-1',
      profileId: 'profile-usa',
    });
  });
});
