import { afterEach, describe, expect, it, vi } from 'vitest';

import { SportsLiveEventRepository } from '../src/repositories/sports-live-event-repository.js';
import { SportsLiveEventService } from '../src/services/sports-live-event-service.js';

type SportsLiveEventRow = {
  id: string;
  guildId: string;
  sportName: string;
  eventId: string;
  eventName: string;
  sportChannelId: string;
  eventChannelId: string | null;
  status: 'scheduled' | 'live' | 'finished' | 'cleanup_due' | 'deleted' | 'failed';
  kickoffAtUtc: Date;
  lastScoreSnapshot: Record<string, unknown> | null;
  lastStateSnapshot: Record<string, unknown> | null;
  lastSyncedAtUtc: Date | null;
  finishedAtUtc: Date | null;
  deleteAfterUtc: Date | null;
  highlightsPosted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

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

function createStatefulMockDb(rows: SportsLiveEventRow[]): MockDb {
  return {
    query: {
      sportsLiveEventChannels: {
        findFirst: vi.fn(async () => rows[0] ?? null),
        findMany: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: async (value: Partial<SportsLiveEventRow>): Promise<void> => {
        rows.push({
          id: String(value.id),
          guildId: String(value.guildId),
          sportName: String(value.sportName),
          eventId: String(value.eventId),
          eventName: String(value.eventName),
          sportChannelId: String(value.sportChannelId),
          eventChannelId: value.eventChannelId ?? null,
          status: (value.status ?? 'scheduled') as SportsLiveEventRow['status'],
          kickoffAtUtc: value.kickoffAtUtc ?? new Date('1970-01-01T00:00:00.000Z'),
          lastScoreSnapshot: (value.lastScoreSnapshot ?? null) as Record<string, unknown> | null,
          lastStateSnapshot: (value.lastStateSnapshot ?? null) as Record<string, unknown> | null,
          lastSyncedAtUtc: value.lastSyncedAtUtc ?? null,
          finishedAtUtc: value.finishedAtUtc ?? null,
          deleteAfterUtc: value.deleteAfterUtc ?? null,
          highlightsPosted: value.highlightsPosted ?? false,
          createdAt: value.createdAt ?? new Date('1970-01-01T00:00:00.000Z'),
          updatedAt: value.updatedAt ?? new Date('1970-01-01T00:00:00.000Z'),
        });
      },
    })),
    update: vi.fn(() => ({
      set: (value: Partial<SportsLiveEventRow>) => ({
        where: async (): Promise<void> => {
          const row = rows[0];
          if (row) {
            Object.assign(row, value);
          }
        },
      }),
    })),
  };
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
    const rows: SportsLiveEventRow[] = [];
    const mockDb = createStatefulMockDb(rows);
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

    expect(rows).toHaveLength(1);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(second.value.id).toBe(first.value.id);
  });

  it('marks finished events for cleanup three hours later', async () => {
    const repository = new SportsLiveEventRepository();
    const markFinishedSpy = vi.spyOn(repository, 'markFinished').mockResolvedValue({
      id: '01J0SPORTSLIVE000000000001',
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
    });

    const service = new SportsLiveEventService(repository);

    const result = await service.markFinished({
      guildId: 'guild-1',
      eventId: 'evt-1',
      finishedAtUtc: new Date('2026-03-20T15:00:00.000Z'),
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }

    expect(markFinishedSpy).toHaveBeenCalledTimes(1);
    expect(markFinishedSpy).toHaveBeenCalledWith({
      guildId: 'guild-1',
      eventId: 'evt-1',
      finishedAtUtc: new Date('2026-03-20T15:00:00.000Z'),
      deleteAfterUtc: new Date('2026-03-20T18:00:00.000Z'),
    });
    expect(result.value.deleteAfterUtc.toISOString()).toBe('2026-03-20T18:00:00.000Z');
    expect(result.value.status).toBe('cleanup_due');
  });
});
