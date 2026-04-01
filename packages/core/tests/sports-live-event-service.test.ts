import { afterEach, describe, expect, it, vi } from 'vitest';

import { SportsLiveEventRepository } from '../src/repositories/sports-live-event-repository.js';
import { SportsLiveEventService } from '../src/services/sports-live-event-service.js';

type MockDb = {
  query: {
    sportsLiveEventChannels: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function createUpdateChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));

  return { update, set, where };
}

function createInsertChain() {
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values }));

  return { insert, values };
}

function createRepositoryWithMockDb(mockDb: MockDb): SportsLiveEventRepository {
  const repository = new SportsLiveEventRepository();
  Object.defineProperty(repository, 'db', {
    value: mockDb,
    configurable: true,
    writable: true,
  });
  return repository;
}

describe('SportsLiveEventService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('creates one tracked row per guild and event', async () => {
    const firstRow = {
      id: '01J0SPORTSLIVE000000000001',
      guildId: 'guild-1',
      sportName: 'Soccer',
      eventId: 'evt-1',
      eventName: 'Rangers vs Celtic',
      sportChannelId: 'sport-1',
      eventChannelId: null,
      status: 'scheduled',
      kickoffAtUtc: new Date('2026-03-20T12:30:00.000Z'),
      lastScoreSnapshot: null,
      lastStateSnapshot: null,
      lastSyncedAtUtc: null,
      finishedAtUtc: null,
      deleteAfterUtc: null,
      highlightsPosted: false,
      createdAt: new Date('2026-03-20T12:00:00.000Z'),
      updatedAt: new Date('2026-03-20T12:00:00.000Z'),
    };

    const mockDb: MockDb = {
      query: {
        sportsLiveEventChannels: {
          findFirst: vi.fn().mockResolvedValue(firstRow),
          findMany: vi.fn(),
        },
      },
      ...createInsertChain(),
      ...createUpdateChain(),
    };

    const service = new SportsLiveEventService(createRepositoryWithMockDb(mockDb));

    const first = await service.upsertTrackedEvent({
      guildId: 'guild-1',
      sportName: 'Soccer',
      eventId: 'evt-1',
      eventName: 'Rangers vs Celtic',
      sportChannelId: 'sport-1',
      kickoffAtUtc: new Date('2026-03-20T12:30:00.000Z'),
    });
    const second = await service.upsertTrackedEvent({
      guildId: 'guild-1',
      sportName: 'Soccer',
      eventId: 'evt-1',
      eventName: 'Rangers vs Celtic',
      sportChannelId: 'sport-1',
      kickoffAtUtc: new Date('2026-03-20T12:30:00.000Z'),
    });

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    if (first.isErr() || second.isErr()) {
      return;
    }

    expect(second.value.id).toBe(first.value.id);
  });

  it('marks finished events for cleanup three hours later', async () => {
    const rowAfterFinish = {
      id: '01J0SPORTSLIVE000000000002',
      guildId: 'guild-1',
      sportName: 'Soccer',
      eventId: 'evt-1',
      eventName: 'Rangers vs Celtic',
      sportChannelId: 'sport-1',
      eventChannelId: null,
      status: 'cleanup_due',
      kickoffAtUtc: new Date('2026-03-20T12:30:00.000Z'),
      lastScoreSnapshot: null,
      lastStateSnapshot: null,
      lastSyncedAtUtc: null,
      finishedAtUtc: new Date('2026-03-20T15:00:00.000Z'),
      deleteAfterUtc: new Date('2026-03-20T18:00:00.000Z'),
      highlightsPosted: false,
      createdAt: new Date('2026-03-20T12:00:00.000Z'),
      updatedAt: new Date('2026-03-20T15:00:00.000Z'),
    };

    const mockDb: MockDb = {
      query: {
        sportsLiveEventChannels: {
          findFirst: vi.fn().mockResolvedValue(rowAfterFinish),
          findMany: vi.fn(),
        },
      },
      ...createInsertChain(),
      ...createUpdateChain(),
    };

    const service = new SportsLiveEventService(createRepositoryWithMockDb(mockDb));

    const result = await service.markFinished({
      guildId: 'guild-1',
      eventId: 'evt-1',
      finishedAtUtc: new Date('2026-03-20T15:00:00.000Z'),
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }

    expect(result.value.deleteAfterUtc.toISOString()).toBe('2026-03-20T18:00:00.000Z');
    expect(result.value.status).toBe('cleanup_due');
  });
});
