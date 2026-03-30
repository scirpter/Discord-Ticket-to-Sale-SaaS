import { describe, expect, it, vi } from 'vitest';

import { NukeRepository } from '../src/repositories/nuke-repository.js';

type MockDb = {
  query: {
    channelNukeSchedules: {
      findFirst: ReturnType<typeof vi.fn>;
    };
  };
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function createInsertChain() {
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values }));

  return { insert, values };
}

function createUpdateChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));

  return { update, set, where };
}

function createRepositoryWithMockDb(mockDb: MockDb): NukeRepository {
  const repository = new NukeRepository();
  Object.defineProperty(repository, 'db', {
    value: mockDb,
    configurable: true,
    writable: true,
  });
  return repository;
}

describe('NukeRepository schedule storage', () => {
  it('updates an existing guild/channel schedule instead of inserting a duplicate when the tenant link changes', async () => {
    const { insert } = createInsertChain();
    const { update, set } = createUpdateChain();
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'schedule-1',
        tenantId: 'tenant-old',
        guildId: 'guild-1',
        channelId: 'channel-1',
        enabled: true,
        localTimeHhmm: '18:30',
        timezone: 'UTC',
        cadence: 'weekly',
        weeklyDayOfWeek: 5,
        monthlyDayOfMonth: null,
        nextRunAtUtc: new Date('2026-03-20T18:30:00.000Z'),
        lastRunAtUtc: null,
        lastLocalRunDate: null,
        consecutiveFailures: 0,
        updatedByDiscordUserId: 'user-1',
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        updatedAt: new Date('2026-03-18T10:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'schedule-1',
        tenantId: 'tenant-new',
        guildId: 'guild-1',
        channelId: 'channel-1',
        enabled: true,
        localTimeHhmm: '18:30',
        timezone: 'UTC',
        cadence: 'weekly',
        weeklyDayOfWeek: 5,
        monthlyDayOfMonth: null,
        nextRunAtUtc: new Date('2026-03-27T18:30:00.000Z'),
        lastRunAtUtc: null,
        lastLocalRunDate: null,
        consecutiveFailures: 0,
        updatedByDiscordUserId: 'user-1',
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        updatedAt: new Date('2026-03-18T10:05:00.000Z'),
      });

    const repository = createRepositoryWithMockDb({
      query: {
        channelNukeSchedules: {
          findFirst,
        },
      },
      insert,
      update,
    });

    const result = await repository.upsertSchedule({
      tenantId: 'tenant-new',
      guildId: 'guild-1',
      channelId: 'channel-1',
      localTimeHhmm: '18:30',
      timezone: 'UTC',
      cadence: 'weekly',
      weeklyDayOfWeek: 5,
      monthlyDayOfMonth: null,
      nextRunAtUtc: new Date('2026-03-27T18:30:00.000Z'),
      updatedByDiscordUserId: 'user-1',
    });

    expect(insert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-new',
        guildId: 'guild-1',
        channelId: 'channel-1',
      }),
    );
    expect(result.tenantId).toBe('tenant-new');
  });
});
