import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChannelCopyRepository } from '../src/repositories/channel-copy-repository.js';

type MockDb = {
  query: {
    channelCopyAuthorizedUsers: {
      findFirst: ReturnType<typeof vi.fn>;
    };
    channelCopyJobs: {
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

function createRepositoryWithMockDb(mockDb: MockDb): ChannelCopyRepository {
  const repository = new ChannelCopyRepository();
  Object.defineProperty(repository, 'db', {
    value: mockDb,
    configurable: true,
    writable: true,
  });
  return repository;
}

describe('ChannelCopyRepository', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a guild-scoped authorized user without touching channel copy jobs', async () => {
    const { insert, values } = createInsertChain();
    const authorizedUserFindFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'auth-1',
        guildId: 'guild-1',
        discordUserId: 'user-1',
        grantedByDiscordUserId: 'admin-1',
        createdAt: new Date('2026-04-12T09:00:00.000Z'),
        updatedAt: new Date('2026-04-12T09:00:00.000Z'),
      });
    const jobsFindFirst = vi.fn();

    const repository = createRepositoryWithMockDb({
      query: {
        channelCopyAuthorizedUsers: {
          findFirst: authorizedUserFindFirst,
        },
        channelCopyJobs: {
          findFirst: jobsFindFirst,
        },
      },
      insert,
      update: vi.fn(),
    });

    const result = await repository.upsertAuthorizedUser({
      guildId: 'guild-1',
      discordUserId: 'user-1',
      grantedByDiscordUserId: 'admin-1',
    });

    expect(result.created).toBe(true);
    expect(result.record).toEqual(
      expect.objectContaining({
        guildId: 'guild-1',
        discordUserId: 'user-1',
        grantedByDiscordUserId: 'admin-1',
      }),
    );
    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-1',
        discordUserId: 'user-1',
        grantedByDiscordUserId: 'admin-1',
      }),
    );
    expect(jobsFindFirst).not.toHaveBeenCalled();
  });

  it('finds the latest incomplete job for the same requester and channel pair', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'job-2',
      destinationGuildId: 'guild-9',
      sourceGuildId: 'guild-1',
      sourceChannelId: 'source-1',
      destinationChannelId: 'dest-1',
      requestedByDiscordUserId: 'user-1',
      confirmToken: 'confirm-2',
      status: 'queued',
      forceConfirmed: true,
      startedAt: null,
      finishedAt: null,
      lastProcessedSourceMessageId: null,
      scannedMessageCount: 15,
      copiedMessageCount: 10,
      skippedMessageCount: 5,
      failureMessage: null,
      createdAt: new Date('2026-04-12T09:05:00.000Z'),
      updatedAt: new Date('2026-04-12T09:06:00.000Z'),
    });

    const repository = createRepositoryWithMockDb({
      query: {
        channelCopyAuthorizedUsers: {
          findFirst: vi.fn(),
        },
        channelCopyJobs: {
          findFirst,
        },
      },
      insert: vi.fn(),
      update: vi.fn(),
    });

    await expect(
      repository.findLatestIncompleteJob({
        sourceChannelId: 'source-1',
        destinationChannelId: 'dest-1',
        requestedByDiscordUserId: 'user-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'job-2',
        sourceChannelId: 'source-1',
        destinationChannelId: 'dest-1',
        requestedByDiscordUserId: 'user-1',
        status: 'queued',
      }),
    );

    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});
