import { describe, expect, it, vi } from 'vitest';

import { NukeRepository } from '../src/repositories/nuke-repository.js';

type MockDb = {
  query: {
    channelNukeAuthorizedUsers: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
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

function createDeleteChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn(() => ({ where }));

  return { delete: remove, where };
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

describe('NukeRepository authorized user access', () => {
  it('creates a new authorized user entry when one does not already exist', async () => {
    const { insert } = createInsertChain();
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'auth-1',
        tenantId: 'tenant-1',
        guildId: 'guild-1',
        discordUserId: 'user-2',
        grantedByDiscordUserId: 'owner-1',
        createdAt: new Date('2026-03-17T12:00:00.000Z'),
        updatedAt: new Date('2026-03-17T12:00:00.000Z'),
      });

    const repository = createRepositoryWithMockDb({
      query: {
        channelNukeAuthorizedUsers: {
          findFirst,
          findMany: vi.fn(),
        },
      },
      insert,
      update: vi.fn(),
      delete: vi.fn(),
    });

    const result = await repository.upsertAuthorizedUser({
      tenantId: 'tenant-1',
      guildId: 'guild-1',
      discordUserId: 'user-2',
      grantedByDiscordUserId: 'owner-1',
    });

    expect(result.created).toBe(true);
    expect(result.record.discordUserId).toBe('user-2');
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('updates an existing authorized user entry instead of inserting a duplicate', async () => {
    const { update } = createUpdateChain();
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'auth-1',
        tenantId: 'tenant-1',
        guildId: 'guild-1',
        discordUserId: 'user-2',
        grantedByDiscordUserId: 'owner-1',
        createdAt: new Date('2026-03-17T12:00:00.000Z'),
        updatedAt: new Date('2026-03-17T12:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'auth-1',
        tenantId: 'tenant-1',
        guildId: 'guild-1',
        discordUserId: 'user-2',
        grantedByDiscordUserId: 'owner-1',
        createdAt: new Date('2026-03-17T12:00:00.000Z'),
        updatedAt: new Date('2026-03-17T12:05:00.000Z'),
      });

    const repository = createRepositoryWithMockDb({
      query: {
        channelNukeAuthorizedUsers: {
          findFirst,
          findMany: vi.fn(),
        },
      },
      insert: vi.fn(),
      update,
      delete: vi.fn(),
    });

    const result = await repository.upsertAuthorizedUser({
      tenantId: 'tenant-1',
      guildId: 'guild-1',
      discordUserId: 'user-2',
      grantedByDiscordUserId: 'owner-1',
    });

    expect(result.created).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('returns false when revoking a Discord user that is not authorized', async () => {
    const repository = createRepositoryWithMockDb({
      query: {
        channelNukeAuthorizedUsers: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn(),
        },
      },
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    });

    await expect(
      repository.revokeAuthorizedUser({
        tenantId: 'tenant-1',
        guildId: 'guild-1',
        discordUserId: 'user-2',
      }),
    ).resolves.toBe(false);
  });

  it('deletes an existing authorized user entry when revoking access', async () => {
    const { delete: remove } = createDeleteChain();
    const repository = createRepositoryWithMockDb({
      query: {
        channelNukeAuthorizedUsers: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'auth-1',
            tenantId: 'tenant-1',
            guildId: 'guild-1',
            discordUserId: 'user-2',
            grantedByDiscordUserId: 'owner-1',
            createdAt: new Date('2026-03-17T12:00:00.000Z'),
            updatedAt: new Date('2026-03-17T12:00:00.000Z'),
          }),
          findMany: vi.fn(),
        },
      },
      insert: vi.fn(),
      update: vi.fn(),
      delete: remove,
    });

    await expect(
      repository.revokeAuthorizedUser({
        tenantId: 'tenant-1',
        guildId: 'guild-1',
        discordUserId: 'user-2',
      }),
    ).resolves.toBe(true);

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
