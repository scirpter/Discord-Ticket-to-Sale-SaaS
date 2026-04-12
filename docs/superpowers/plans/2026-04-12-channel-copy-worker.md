# Channel Copy Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Discord channel-copy bot that backfills all text and attachments from one source channel into one destination channel, supports cross-server copies, and uses its own isolated remote activation system.

**Architecture:** Add guild-scoped copy-bot activation and job persistence to `packages/core`, then build a new `apps/channel-copy-worker` package that uses `discord.js` to validate channels, fetch source history, and re-upload attachments into the destination channel. Keep activation isolated from every other worker by using dedicated tables, repository methods, and slash-command handlers for this worker only.

**Tech Stack:** TypeScript, discord.js 14.25.1, Drizzle ORM/MySQL, Vitest, neverthrow, Node.js 24.13.1

---

### Task 1: Add channel-copy env config, schema, and repository scaffolding

**Files:**
- Create: `drizzle/migrations/0024_channel_copy_worker.sql`
- Create: `drizzle/migrations/meta/0024_snapshot.json`
- Modify: `drizzle/migrations/meta/_journal.json`
- Modify: `packages/core/src/config/env.ts`
- Modify: `packages/core/src/infra/db/schema/tables.ts`
- Modify: `packages/core/src/infra/db/schema/index.ts`
- Create: `packages/core/src/repositories/channel-copy-repository.ts`
- Create: `packages/core/tests/channel-copy-repository.test.ts`
- Modify: `packages/core/tests/env.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing env and repository tests**

```ts
// packages/core/tests/env.test.ts
it('defaults channel-copy worker credentials to empty strings', () => {
  delete process.env.CHANNEL_COPY_DISCORD_TOKEN;
  delete process.env.CHANNEL_COPY_DISCORD_CLIENT_ID;
  process.env.VOODOO_ENV_FILE = '__missing_env_file__.env';
  resetEnvForTests();

  expect(getEnv().CHANNEL_COPY_DISCORD_TOKEN).toBe('');
  expect(getEnv().CHANNEL_COPY_DISCORD_CLIENT_ID).toBe('');
});
```

```ts
// packages/core/tests/channel-copy-repository.test.ts
import { describe, expect, it, vi } from 'vitest';

import { ChannelCopyRepository } from '../src/repositories/channel-copy-repository.js';

function createRepositoryWithMockDb(mockDb: Record<string, unknown>): ChannelCopyRepository {
  const repository = new ChannelCopyRepository();
  Object.defineProperty(repository, 'db', {
    value: mockDb,
    configurable: true,
    writable: true,
  });
  return repository;
}

it('creates a guild-scoped authorized user without touching other worker tables', async () => {
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const findFirst = vi
    .fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({
      id: 'auth-copy-1',
      guildId: 'guild-9',
      discordUserId: 'user-2',
      grantedByDiscordUserId: 'owner-1',
      createdAt: new Date('2026-04-12T12:00:00.000Z'),
      updatedAt: new Date('2026-04-12T12:00:00.000Z'),
    });

  const repository = createRepositoryWithMockDb({
    query: {
      channelCopyAuthorizedUsers: {
        findFirst,
        findMany: vi.fn(),
      },
      channelCopyJobs: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({ values: insertValues })),
    update: vi.fn(),
    delete: vi.fn(),
  });

  const result = await repository.upsertAuthorizedUser({
    guildId: 'guild-9',
    discordUserId: 'user-2',
    grantedByDiscordUserId: 'owner-1',
  });

  expect(result.created).toBe(true);
  expect(result.record.guildId).toBe('guild-9');
});

it('finds the latest incomplete job for the same requester and channel pair', async () => {
  const repository = createRepositoryWithMockDb({
    query: {
      channelCopyAuthorizedUsers: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      channelCopyJobs: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'job-1',
          destinationGuildId: 'guild-dest',
          sourceGuildId: 'guild-src',
          sourceChannelId: '100',
          destinationChannelId: '200',
          requestedByDiscordUserId: 'user-1',
          confirmToken: 'CONFIRM-123',
          status: 'awaiting_confirmation',
          forceConfirmed: false,
          startedAt: null,
          finishedAt: null,
          lastProcessedSourceMessageId: null,
          scannedMessageCount: 0,
          copiedMessageCount: 0,
          skippedMessageCount: 0,
          failureMessage: null,
          createdAt: new Date('2026-04-12T12:00:00.000Z'),
          updatedAt: new Date('2026-04-12T12:00:00.000Z'),
        }),
      },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  });

  await expect(
    repository.findLatestIncompleteJob({
      sourceChannelId: '100',
      destinationChannelId: '200',
      requestedByDiscordUserId: 'user-1',
    }),
  ).resolves.toEqual(
    expect.objectContaining({
      id: 'job-1',
      status: 'awaiting_confirmation',
      confirmToken: 'CONFIRM-123',
    }),
  );
});
```

- [ ] **Step 2: Run the targeted tests to verify the current codebase is missing the channel-copy config and repository**

Run: `pnpm exec vitest run packages/core/tests/env.test.ts packages/core/tests/channel-copy-repository.test.ts`

Expected: FAIL because `CHANNEL_COPY_DISCORD_TOKEN`, `CHANNEL_COPY_DISCORD_CLIENT_ID`, `ChannelCopyRepository`, and the channel-copy tables do not exist yet.

- [ ] **Step 3: Add the env vars, schema, migration, and repository methods**

```ts
// packages/core/src/config/env.ts
const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1).default('MISSING_DISCORD_TOKEN'),
  DISCORD_CLIENT_ID: z.string().min(1).default('MISSING_DISCORD_CLIENT_ID'),
  JOIN_GATE_DISCORD_TOKEN: z.string().default(''),
  JOIN_GATE_DISCORD_CLIENT_ID: z.string().default(''),
  SPORTS_DISCORD_TOKEN: z.string().default(''),
  SPORTS_DISCORD_CLIENT_ID: z.string().default(''),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_BOT_USERNAME: z.string().default(''),
  NUKE_DISCORD_TOKEN: z.string().default(''),
  NUKE_DISCORD_CLIENT_ID: z.string().default(''),
  CHANNEL_COPY_DISCORD_TOKEN: z.string().default(''),
  CHANNEL_COPY_DISCORD_CLIENT_ID: z.string().default(''),
  DATABASE_URL: z.string().min(1).default('mysql://root:root@localhost:3306/voodoo'),
});
```

```ts
// packages/core/src/infra/db/schema/tables.ts
export const channelCopyAuthorizedUsers = mysqlTable(
  'channel_copy_authorized_users',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    discordUserId: varchar('discord_user_id', { length: 32 }).notNull(),
    grantedByDiscordUserId: varchar('granted_by_discord_user_id', { length: 32 }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    guildUserUnique: uniqueIndex('channel_copy_authorized_users_guild_user_uq').on(
      table.guildId,
      table.discordUserId,
    ),
    guildIdx: index('channel_copy_authorized_users_guild_idx').on(table.guildId),
  }),
);
```

```ts
// packages/core/src/infra/db/schema/tables.ts
export const channelCopyJobs = mysqlTable(
  'channel_copy_jobs',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    destinationGuildId: varchar('destination_guild_id', { length: 32 }).notNull(),
    sourceGuildId: varchar('source_guild_id', { length: 32 }).notNull(),
    sourceChannelId: varchar('source_channel_id', { length: 32 }).notNull(),
    destinationChannelId: varchar('destination_channel_id', { length: 32 }).notNull(),
    requestedByDiscordUserId: varchar('requested_by_discord_user_id', { length: 32 }).notNull(),
    confirmToken: varchar('confirm_token', { length: 64 }),
    status: mysqlEnum('status', ['awaiting_confirmation', 'queued', 'running', 'completed', 'failed']).notNull(),
    forceConfirmed: boolean('force_confirmed').notNull().default(false),
    startedAt: timestamp('started_at', { mode: 'date' }),
    finishedAt: timestamp('finished_at', { mode: 'date' }),
    lastProcessedSourceMessageId: varchar('last_processed_source_message_id', { length: 32 }),
    scannedMessageCount: int('scanned_message_count').notNull().default(0),
    copiedMessageCount: int('copied_message_count').notNull().default(0),
    skippedMessageCount: int('skipped_message_count').notNull().default(0),
    failureMessage: text('failure_message'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    destinationCreatedIdx: index('channel_copy_jobs_destination_created_idx').on(
      table.destinationGuildId,
      table.createdAt,
    ),
    statusUpdatedIdx: index('channel_copy_jobs_status_updated_idx').on(table.status, table.updatedAt),
  }),
);
```

```sql
-- drizzle/migrations/0024_channel_copy_worker.sql
CREATE TABLE `channel_copy_authorized_users` (
  `id` varchar(26) NOT NULL,
  `guild_id` varchar(32) NOT NULL,
  `discord_user_id` varchar(32) NOT NULL,
  `granted_by_discord_user_id` varchar(32),
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `channel_copy_authorized_users_pk` PRIMARY KEY (`id`),
  CONSTRAINT `channel_copy_authorized_users_guild_user_uq` UNIQUE (`guild_id`, `discord_user_id`)
);

CREATE TABLE `channel_copy_jobs` (
  `id` varchar(26) NOT NULL,
  `destination_guild_id` varchar(32) NOT NULL,
  `source_guild_id` varchar(32) NOT NULL,
  `source_channel_id` varchar(32) NOT NULL,
  `destination_channel_id` varchar(32) NOT NULL,
  `requested_by_discord_user_id` varchar(32) NOT NULL,
  `confirm_token` varchar(64),
  `status` enum('awaiting_confirmation','queued','running','completed','failed') NOT NULL,
  `force_confirmed` boolean NOT NULL DEFAULT false,
  `started_at` timestamp NULL,
  `finished_at` timestamp NULL,
  `last_processed_source_message_id` varchar(32),
  `scanned_message_count` int NOT NULL DEFAULT 0,
  `copied_message_count` int NOT NULL DEFAULT 0,
  `skipped_message_count` int NOT NULL DEFAULT 0,
  `failure_message` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `channel_copy_jobs_pk` PRIMARY KEY (`id`)
);

CREATE INDEX `channel_copy_authorized_users_guild_idx`
  ON `channel_copy_authorized_users` (`guild_id`);
CREATE INDEX `channel_copy_jobs_destination_created_idx`
  ON `channel_copy_jobs` (`destination_guild_id`, `created_at`);
CREATE INDEX `channel_copy_jobs_status_updated_idx`
  ON `channel_copy_jobs` (`status`, `updated_at`);
```

```ts
// packages/core/src/repositories/channel-copy-repository.ts
export class ChannelCopyRepository {
  private readonly db = getDb();

  public async upsertAuthorizedUser(input: {
    guildId: string;
    discordUserId: string;
    grantedByDiscordUserId: string;
  }): Promise<{ created: boolean; record: ChannelCopyAuthorizedUserRecord }> {
    const existing = await this.getAuthorizedUserByDiscordId({
      guildId: input.guildId,
      discordUserId: input.discordUserId,
    });
    const now = new Date();

    if (existing) {
      await this.db
        .update(channelCopyAuthorizedUsers)
        .set({
          grantedByDiscordUserId: input.grantedByDiscordUserId,
          updatedAt: now,
        })
        .where(eq(channelCopyAuthorizedUsers.id, existing.id));
    } else {
      await this.db.insert(channelCopyAuthorizedUsers).values({
        id: ulid(),
        guildId: input.guildId,
        discordUserId: input.discordUserId,
        grantedByDiscordUserId: input.grantedByDiscordUserId,
        createdAt: now,
        updatedAt: now,
      });
    }

    const record = await this.getAuthorizedUserByDiscordId({
      guildId: input.guildId,
      discordUserId: input.discordUserId,
    });
    if (!record) {
      throw new Error('Failed to upsert channel-copy authorized user');
    }

    return { created: !existing, record };
  }

  public async findLatestIncompleteJob(input: {
    sourceChannelId: string;
    destinationChannelId: string;
    requestedByDiscordUserId: string;
  }): Promise<ChannelCopyJobRecord | null> {
    const row = await this.db.query.channelCopyJobs.findFirst({
      where: and(
        eq(channelCopyJobs.sourceChannelId, input.sourceChannelId),
        eq(channelCopyJobs.destinationChannelId, input.destinationChannelId),
        eq(channelCopyJobs.requestedByDiscordUserId, input.requestedByDiscordUserId),
        ne(channelCopyJobs.status, 'completed'),
      ),
      orderBy: (table, { desc }) => [desc(table.updatedAt), desc(table.createdAt)],
    });

    return row ? mapJobRow(row) : null;
  }
}
```

```env
# .env.example
CHANNEL_COPY_DISCORD_TOKEN=
CHANNEL_COPY_DISCORD_CLIENT_ID=
```

- [ ] **Step 4: Run the targeted tests to verify the new config and repository pass**

Run: `pnpm exec vitest run packages/core/tests/env.test.ts packages/core/tests/channel-copy-repository.test.ts`

Expected: PASS with the new env fields, migration-backed schema exports, and repository methods.

- [ ] **Step 5: Commit**

```bash
git add drizzle/migrations/0024_channel_copy_worker.sql drizzle/migrations/meta/0024_snapshot.json drizzle/migrations/meta/_journal.json packages/core/src/config/env.ts packages/core/src/infra/db/schema/tables.ts packages/core/src/infra/db/schema/index.ts packages/core/src/repositories/channel-copy-repository.ts packages/core/tests/channel-copy-repository.test.ts packages/core/tests/env.test.ts .env.example
git commit -m "feat: add channel copy persistence schema"
```

### Task 2: Implement the core channel-copy service and service-level tests

**Files:**
- Create: `packages/core/src/services/channel-copy-service.ts`
- Create: `packages/core/tests/channel-copy-service.test.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/channel-copy-repository.test.ts`

- [ ] **Step 1: Write the failing service tests for isolated activation, force confirmation, and resumable progress**

```ts
// packages/core/tests/channel-copy-service.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChannelCopyService } from '../src/services/channel-copy-service.js';

describe('ChannelCopyService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps channel-copy activation isolated to its own allowlist', async () => {
    const service = new ChannelCopyService();
    const repository = (service as unknown as { repository: { listAuthorizedUsers: (input: unknown) => Promise<unknown[]> } }).repository;

    vi.spyOn(repository, 'listAuthorizedUsers').mockResolvedValue([
      {
        id: 'auth-copy-1',
        guildId: 'guild-dest',
        discordUserId: 'user-2',
        grantedByDiscordUserId: 'owner-1',
        createdAt: new Date('2026-04-12T12:00:00.000Z'),
        updatedAt: new Date('2026-04-12T12:00:00.000Z'),
      },
    ]);

    const result = await service.getCommandAccessState({
      guildId: 'guild-dest',
      discordUserId: 'user-2',
    });

    expect(result.isOk()).toBe(true);
    expect(result.value).toEqual({
      locked: true,
      allowed: true,
      activated: true,
      authorizedUserCount: 1,
    });
  });

  it('returns awaiting_confirmation when the destination channel is not empty and no confirm token was supplied', async () => {
    const service = new ChannelCopyService();
    const adapter = {
      getChannel: vi.fn()
        .mockResolvedValueOnce({ id: 'src-1', guildId: 'guild-src', kind: 'guildText' })
        .mockResolvedValueOnce({ id: 'dest-1', guildId: 'guild-dest', kind: 'guildText' }),
      assertReadableSource: vi.fn().mockResolvedValue(undefined),
      assertWritableDestination: vi.fn().mockResolvedValue(undefined),
      countDestinationMessages: vi.fn().mockResolvedValue(5),
      listSourceMessages: vi.fn(),
      repostMessage: vi.fn(),
    };

    const result = await service.startCopyRun({
      sourceChannelId: 'src-1',
      destinationChannelId: 'dest-1',
      requestedByDiscordUserId: 'user-2',
      destinationGuildId: 'guild-dest',
      confirmToken: null,
      adapter,
    });

    expect(result.isOk()).toBe(true);
    expect(result.value.status).toBe('awaiting_confirmation');
    expect(result.value.requiresConfirmToken).toMatch(/^COPY-/u);
  });

  it('resumes after the last processed source message id for an incomplete job', async () => {
    const service = new ChannelCopyService();
    const repository = (service as unknown as {
      repository: {
        findLatestIncompleteJob: (input: unknown) => Promise<unknown>;
      };
    }).repository;

    vi.spyOn(repository, 'findLatestIncompleteJob').mockResolvedValue({
      id: 'job-1',
      destinationGuildId: 'guild-dest',
      sourceGuildId: 'guild-src',
      sourceChannelId: 'src-1',
      destinationChannelId: 'dest-1',
      requestedByDiscordUserId: 'user-2',
      confirmToken: null,
      status: 'running',
      forceConfirmed: true,
      startedAt: new Date('2026-04-12T12:00:00.000Z'),
      finishedAt: null,
      lastProcessedSourceMessageId: '1002',
      scannedMessageCount: 2,
      copiedMessageCount: 2,
      skippedMessageCount: 0,
      failureMessage: null,
      createdAt: new Date('2026-04-12T12:00:00.000Z'),
      updatedAt: new Date('2026-04-12T12:00:30.000Z'),
    });

    const adapter = {
      getChannel: vi.fn()
        .mockResolvedValueOnce({ id: 'src-1', guildId: 'guild-src', kind: 'guildText' })
        .mockResolvedValueOnce({ id: 'dest-1', guildId: 'guild-dest', kind: 'guildText' }),
      assertReadableSource: vi.fn().mockResolvedValue(undefined),
      assertWritableDestination: vi.fn().mockResolvedValue(undefined),
      countDestinationMessages: vi.fn().mockResolvedValue(0),
      listSourceMessages: vi.fn().mockResolvedValue([
        { id: '1003', content: 'third', attachments: [], isSystem: false },
      ]),
      repostMessage: vi.fn().mockResolvedValue({ destinationMessageId: '2003' }),
    };

    const result = await service.startCopyRun({
      sourceChannelId: 'src-1',
      destinationChannelId: 'dest-1',
      requestedByDiscordUserId: 'user-2',
      destinationGuildId: 'guild-dest',
      confirmToken: null,
      adapter,
    });

    expect(result.isOk()).toBe(true);
    expect(adapter.listSourceMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        afterMessageId: '1002',
      }),
    );
  });
});
```

- [ ] **Step 2: Run the targeted tests to verify the service API is missing**

Run: `pnpm exec vitest run packages/core/tests/channel-copy-service.test.ts`

Expected: FAIL because `ChannelCopyService`, `getCommandAccessState`, `startCopyRun`, and the runtime adapter contract do not exist yet.

- [ ] **Step 3: Implement the service with a worker-supplied runtime adapter**

```ts
// packages/core/src/services/channel-copy-service.ts
import { err, ok, type Result } from 'neverthrow';
import { ulid } from 'ulid';

import { AppError, fromUnknownError } from '../domain/errors.js';
import {
  ChannelCopyRepository,
  type ChannelCopyJobRecord,
} from '../repositories/channel-copy-repository.js';

export type ChannelCopyRuntimeAdapter = {
  getChannel(input: { channelId: string }): Promise<{
    id: string;
    guildId: string;
    kind: 'guildText' | 'guildAnnouncement';
  }>;
  assertReadableSource(input: { channelId: string }): Promise<void>;
  assertWritableDestination(input: { channelId: string }): Promise<void>;
  countDestinationMessages(input: { channelId: string }): Promise<number>;
  listSourceMessages(input: {
    channelId: string;
    afterMessageId: string | null;
    limit: number;
  }): Promise<
    Array<{
      id: string;
      content: string;
      attachments: Array<{ name: string; contentType: string | null; data: Buffer }>;
      isSystem: boolean;
    }>
  >;
  repostMessage(input: {
    channelId: string;
    content: string;
    attachments: Array<{ name: string; contentType: string | null; data: Buffer }>;
  }): Promise<{ destinationMessageId: string }>;
};

export class ChannelCopyService {
  private readonly repository = new ChannelCopyRepository();

  public async getCommandAccessState(input: {
    guildId: string;
    discordUserId: string;
  }): Promise<Result<{ locked: boolean; allowed: boolean; activated: boolean; authorizedUserCount: number }, AppError>> {
    try {
      const authorizedUsers = await this.repository.listAuthorizedUsers({ guildId: input.guildId });
      const authorizedUserCount = authorizedUsers.length;
      return ok({
        locked: true,
        allowed: authorizedUsers.some((user) => user.discordUserId === input.discordUserId),
        activated: authorizedUserCount > 0,
        authorizedUserCount,
      });
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async startCopyRun(input: {
    sourceChannelId: string;
    destinationChannelId: string;
    requestedByDiscordUserId: string;
    destinationGuildId: string;
    confirmToken: string | null;
    adapter: ChannelCopyRuntimeAdapter;
  }): Promise<Result<{
    jobId: string;
    status: 'awaiting_confirmation' | 'completed';
    requiresConfirmToken: string | null;
    copiedMessageCount: number;
    skippedMessageCount: number;
  }, AppError>> {
    const sourceChannel = await input.adapter.getChannel({ channelId: input.sourceChannelId });
    const destinationChannel = await input.adapter.getChannel({ channelId: input.destinationChannelId });
    if (destinationChannel.guildId !== input.destinationGuildId) {
      return err(
        new AppError(
          'CHANNEL_COPY_DESTINATION_GUILD_MISMATCH',
          'Run this command from the destination server only.',
          403,
        ),
      );
    }

    await input.adapter.assertReadableSource({ channelId: input.sourceChannelId });
    await input.adapter.assertWritableDestination({ channelId: input.destinationChannelId });

    const existingJob = await this.repository.findLatestIncompleteJob({
      sourceChannelId: input.sourceChannelId,
      destinationChannelId: input.destinationChannelId,
      requestedByDiscordUserId: input.requestedByDiscordUserId,
    });

    const destinationMessageCount = await input.adapter.countDestinationMessages({
      channelId: input.destinationChannelId,
    });
    if (destinationMessageCount > 0 && (!existingJob || existingJob.confirmToken !== input.confirmToken)) {
      const confirmToken = `COPY-${ulid().slice(-8)}`.toUpperCase();
      const pendingJob = await this.repository.createAwaitingConfirmationJob({
        destinationGuildId: destinationChannel.guildId,
        sourceGuildId: sourceChannel.guildId,
        sourceChannelId: input.sourceChannelId,
        destinationChannelId: input.destinationChannelId,
        requestedByDiscordUserId: input.requestedByDiscordUserId,
        confirmToken,
      });

      return ok({
        jobId: pendingJob.id,
        status: 'awaiting_confirmation',
        requiresConfirmToken: confirmToken,
        copiedMessageCount: pendingJob.copiedMessageCount,
        skippedMessageCount: pendingJob.skippedMessageCount,
      });
    }

    return ok({
      jobId: existingJob?.id ?? ulid(),
      status: 'completed',
      requiresConfirmToken: null,
      copiedMessageCount: 0,
      skippedMessageCount: 0,
    });
  }
}
```

```ts
// packages/core/src/index.ts
export * from './repositories/channel-copy-repository.js';
export * from './services/channel-copy-service.js';
```

- [ ] **Step 4: Run the targeted tests to verify the service logic passes**

Run: `pnpm exec vitest run packages/core/tests/channel-copy-service.test.ts packages/core/tests/channel-copy-repository.test.ts`

Expected: PASS with service-level handling for isolated activation, confirmation gating, and resumable copy progress.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/services/channel-copy-service.ts packages/core/src/index.ts packages/core/tests/channel-copy-service.test.ts packages/core/tests/channel-copy-repository.test.ts
git commit -m "feat: add channel copy core service"
```

### Task 3: Scaffold the standalone channel-copy worker, command deployment, and activation command

**Files:**
- Create: `apps/channel-copy-worker/package.json`
- Create: `apps/channel-copy-worker/tsconfig.json`
- Create: `apps/channel-copy-worker/src/index.ts`
- Create: `apps/channel-copy-worker/src/deploy-commands.ts`
- Create: `apps/channel-copy-worker/src/commands/activation.ts`
- Create: `apps/channel-copy-worker/src/commands/activation.test.ts`
- Modify: `package.json`
- Modify: `packages/core/tests/tooling-config.test.ts`

- [ ] **Step 1: Write the failing activation and tooling tests**

```ts
// apps/channel-copy-worker/src/commands/activation.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageFlags } from 'discord.js';

vi.mock('@voodoo/core', () => {
  class ChannelCopyService {
    public async listAuthorizedUsers(): Promise<never> {
      throw new Error('Mock listAuthorizedUsers not implemented');
    }
    public async grantUserAccess(): Promise<never> {
      throw new Error('Mock grantUserAccess not implemented');
    }
    public async revokeUserAccess(): Promise<never> {
      throw new Error('Mock revokeUserAccess not implemented');
    }
  }

  return {
    ChannelCopyService,
    getEnv: () => ({
      superAdminDiscordIds: (process.env.SUPER_ADMIN_DISCORD_IDS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    }),
    resetEnvForTests: () => undefined,
  };
});
```

```ts
// apps/channel-copy-worker/src/commands/activation.test.ts
import { ChannelCopyService } from '@voodoo/core';
import { activationCommand } from './activation.js';

it('grants remote channel-copy access by guild ID and user ID', async () => {
  vi.spyOn(ChannelCopyService.prototype, 'grantUserAccess').mockResolvedValue({
    isErr: () => false,
    isOk: () => true,
    value: {
      authorizationId: 'auth-copy-1',
      discordUserId: '234567890123456789',
      created: true,
    },
  } as Awaited<ReturnType<ChannelCopyService['grantUserAccess']>>);

  const interaction = createInteractionMock({
    userId: 'owner-1',
    subcommand: 'grant',
    guildId: '123456789012345678',
    userIdOption: '234567890123456789',
    targetGuildName: 'Archive Hub',
  });

  await activationCommand.execute(interaction);

  expect(interaction.editReply).toHaveBeenCalledWith({
    content:
      'Granted channel-copy worker access for `234567890123456789` in `Archive Hub` (`123456789012345678`).',
  });
});
```

```ts
// packages/core/tests/tooling-config.test.ts
it('registers channel-copy worker scripts in the root workspace package', () => {
  expect(rootPackageJson.scripts.dev).toContain('@voodoo/channel-copy-worker');
  expect(rootPackageJson.scripts.build).toContain('@voodoo/channel-copy-worker build');
  expect(rootPackageJson.scripts['deploy:commands:channel-copy']).toContain(
    '@voodoo/channel-copy-worker deploy:commands',
  );
  expect(rootPackageJson.scripts['deploy:commands']).toContain('deploy:commands:channel-copy');
});
```

- [ ] **Step 2: Run the targeted tests to verify the worker and root scripts do not exist yet**

Run: `pnpm exec vitest run apps/channel-copy-worker/src/commands/activation.test.ts packages/core/tests/tooling-config.test.ts`

Expected: FAIL because `apps/channel-copy-worker` is missing and the root workspace scripts do not mention the new worker.

- [ ] **Step 3: Create the worker package, root scripts, and activation command**

```json
// apps/channel-copy-worker/package.json
{
  "name": "@voodoo/channel-copy-worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "deploy:commands": "tsx src/deploy-commands.ts"
  },
  "dependencies": {
    "@voodoo/core": "workspace:*",
    "discord.js": "14.25.1"
  }
}
```

```ts
// apps/channel-copy-worker/src/index.ts
import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js';
import { getEnv, logger } from '@voodoo/core';

import { activationCommand } from './commands/activation.js';
import { channelCopyCommand, mapChannelCopyError } from './commands/channel-copy.js';

type Command = {
  data: { name: string };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

function resolveChannelCopyWorkerToken(): string {
  const token = getEnv().CHANNEL_COPY_DISCORD_TOKEN.trim();
  if (token.length > 0) {
    return token;
  }
  throw new Error('CHANNEL_COPY_DISCORD_TOKEN is required for apps/channel-copy-worker.');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commands = new Collection<string, Command>();
commands.set(activationCommand.data.name, activationCommand as unknown as Command);
commands.set(channelCopyCommand.data.name, channelCopyCommand as unknown as Command);

client.once(Events.ClientReady, () => {
  logger.info({ botUser: client.user?.tag }, 'channel-copy-worker ready');
});

client.on(Events.InteractionCreate, (interaction: Interaction) => {
  void handleInteraction(interaction);
});

void client.login(resolveChannelCopyWorkerToken());
```

```ts
// apps/channel-copy-worker/src/deploy-commands.ts
const payload = [channelCopyCommand.data.toJSON(), activationCommand.data.toJSON()];
```

```ts
// apps/channel-copy-worker/src/commands/activation.ts
export const activationCommand = {
  data: new SlashCommandBuilder()
    .setName('activation')
    .setDescription('Manage remote activation for the channel-copy worker')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('grant')
        .setDescription('Grant channel-copy worker access for a target server and Discord user')
        .addStringOption((option) =>
          option.setName('guild_id').setDescription('Discord server ID to activate').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('user_id').setDescription('Discord user ID to authorize').setRequired(true),
        ),
    ),
};
```

```json
// package.json
{
  "scripts": {
    "dev": "concurrently -n web,bot,telegram,nuke,joingate,sports,copy -c cyan,magenta,green,yellow,blue,red,white \"pnpm --filter @voodoo/web-app dev\" \"pnpm --filter @voodoo/bot-worker dev\" \"pnpm --filter @voodoo/telegram-worker dev\" \"pnpm --filter @voodoo/nuke-worker dev\" \"pnpm --filter @voodoo/join-gate-worker dev\" \"pnpm --filter @voodoo/sports-worker dev\" \"pnpm --filter @voodoo/channel-copy-worker dev\"",
    "build": "pnpm --filter @voodoo/core build && pnpm --filter @voodoo/bot-worker build && pnpm --filter @voodoo/telegram-worker build && pnpm --filter @voodoo/nuke-worker build && pnpm --filter @voodoo/join-gate-worker build && pnpm --filter @voodoo/sports-worker build && pnpm --filter @voodoo/channel-copy-worker build && pnpm --filter @voodoo/web-app build",
    "deploy:commands": "pnpm deploy:commands:bot && pnpm deploy:commands:join-gate && pnpm deploy:commands:nuke && pnpm deploy:commands:sports && pnpm deploy:commands:channel-copy",
    "deploy:commands:channel-copy": "pnpm --filter @voodoo/channel-copy-worker deploy:commands"
  }
}
```

- [ ] **Step 4: Run the targeted tests to verify the worker scaffold and activation command pass**

Run: `pnpm exec vitest run apps/channel-copy-worker/src/commands/activation.test.ts packages/core/tests/tooling-config.test.ts`

Expected: PASS with the standalone worker package, root script wiring, and remote activation command in place.

- [ ] **Step 5: Commit**

```bash
git add apps/channel-copy-worker/package.json apps/channel-copy-worker/tsconfig.json apps/channel-copy-worker/src/index.ts apps/channel-copy-worker/src/deploy-commands.ts apps/channel-copy-worker/src/commands/activation.ts apps/channel-copy-worker/src/commands/activation.test.ts package.json packages/core/tests/tooling-config.test.ts
git commit -m "feat: scaffold channel copy worker"
```

### Task 4: Implement `/channel-copy` run and status commands with the discord.js runtime adapter

**Files:**
- Create: `apps/channel-copy-worker/src/commands/channel-copy.ts`
- Create: `apps/channel-copy-worker/src/commands/channel-copy.test.ts`
- Modify: `apps/channel-copy-worker/src/index.ts`
- Test: `packages/core/tests/channel-copy-service.test.ts`

- [ ] **Step 1: Write the failing command tests for confirmation gating, same-channel rejection, and successful copy runs**

```ts
// apps/channel-copy-worker/src/commands/channel-copy.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@voodoo/core', () => {
  class ChannelCopyService {
    public async getCommandAccessState(): Promise<never> {
      throw new Error('Mock getCommandAccessState not implemented');
    }
    public async startCopyRun(): Promise<never> {
      throw new Error('Mock startCopyRun not implemented');
    }
    public async getJobStatus(): Promise<never> {
      throw new Error('Mock getJobStatus not implemented');
    }
  }

  return {
    ChannelCopyService,
    AppError: class AppError extends Error {
      constructor(
        public readonly code: string,
        message: string,
        public readonly statusCode: number,
      ) {
        super(message);
      }
    },
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  };
});

import { ChannelCopyService } from '@voodoo/core';
import { channelCopyCommand } from './channel-copy.js';

it('refuses to copy into a non-empty destination without the returned confirm token', async () => {
  vi.spyOn(ChannelCopyService.prototype, 'getCommandAccessState').mockResolvedValue({
    isErr: () => false,
    isOk: () => true,
    value: {
      locked: true,
      allowed: true,
      activated: true,
      authorizedUserCount: 1,
    },
  } as Awaited<ReturnType<ChannelCopyService['getCommandAccessState']>>);

  vi.spyOn(ChannelCopyService.prototype, 'startCopyRun').mockResolvedValue({
    isErr: () => false,
    isOk: () => true,
    value: {
      jobId: 'job-1',
      status: 'awaiting_confirmation',
      requiresConfirmToken: 'COPY-ABCD',
      copiedMessageCount: 0,
      skippedMessageCount: 0,
    },
  } as Awaited<ReturnType<ChannelCopyService['startCopyRun']>>);

  const interaction = createInteractionMock({
    subcommand: 'run',
    sourceChannelId: '123456789012345678',
    destinationChannelId: '234567890123456789',
  });

  await channelCopyCommand.execute(interaction);

  expect(interaction.editReply).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining('Destination channel is not empty'),
    }),
  );
  expect(interaction.editReply).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining('COPY-ABCD'),
    }),
  );
});

it('rejects runs where the source and destination channel IDs are the same', async () => {
  const interaction = createInteractionMock({
    subcommand: 'run',
    sourceChannelId: '123456789012345678',
    destinationChannelId: '123456789012345678',
  });

  await channelCopyCommand.execute(interaction);

  expect(interaction.editReply).toHaveBeenCalledWith(
    expect.objectContaining({
      content: 'Source and destination channels must be different.',
    }),
  );
});

it('reports copied and skipped totals after a successful backfill', async () => {
  vi.spyOn(ChannelCopyService.prototype, 'getCommandAccessState').mockResolvedValue({
    isErr: () => false,
    isOk: () => true,
    value: {
      locked: true,
      allowed: true,
      activated: true,
      authorizedUserCount: 1,
    },
  } as Awaited<ReturnType<ChannelCopyService['getCommandAccessState']>>);

  vi.spyOn(ChannelCopyService.prototype, 'startCopyRun').mockResolvedValue({
    isErr: () => false,
    isOk: () => true,
    value: {
      jobId: 'job-2',
      status: 'completed',
      requiresConfirmToken: null,
      copiedMessageCount: 45,
      skippedMessageCount: 3,
    },
  } as Awaited<ReturnType<ChannelCopyService['startCopyRun']>>);
  
  const interaction = createInteractionMock({
    subcommand: 'run',
    sourceChannelId: '123456789012345678',
    destinationChannelId: '234567890123456789',
    confirmToken: 'COPY-OK',
  });

  await channelCopyCommand.execute(interaction);

  expect(interaction.editReply).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining('Copied 45 message(s)'),
    }),
  );
});
```

- [ ] **Step 2: Run the targeted tests to verify the channel-copy command is still missing**

Run: `pnpm exec vitest run apps/channel-copy-worker/src/commands/channel-copy.test.ts packages/core/tests/channel-copy-service.test.ts`

Expected: FAIL because `/channel-copy` does not exist and the worker does not yet pass a runtime adapter into the service.

- [ ] **Step 3: Implement the command and adapter-backed execution flow**

```ts
// apps/channel-copy-worker/src/commands/channel-copy.ts
import {
  AttachmentBuilder,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
  type GuildTextBasedChannel,
  type Message,
} from 'discord.js';
import { AppError, ChannelCopyService } from '@voodoo/core';

const channelCopyService = new ChannelCopyService();

export const channelCopyCommand = {
  data: new SlashCommandBuilder()
    .setName('channel-copy')
    .setDescription('Copy one channel into another channel once')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('run')
        .setDescription('Copy all messages and attachments from a source channel into a destination channel')
        .addStringOption((option) =>
          option.setName('source_channel_id').setDescription('Source Discord channel ID').setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('destination_channel_id')
            .setDescription('Destination Discord channel ID')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('confirm').setDescription('Force token returned when destination is not empty'),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Show the status of a channel-copy job')
        .addStringOption((option) =>
          option.setName('job_id').setDescription('Channel-copy job ID').setRequired(true),
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const subcommand = interaction.options.getSubcommand(true);
    if (subcommand === 'run') {
      const sourceChannelId = interaction.options.getString('source_channel_id', true).trim();
      const destinationChannelId = interaction.options.getString('destination_channel_id', true).trim();
      if (sourceChannelId === destinationChannelId) {
        await interaction.editReply({ content: 'Source and destination channels must be different.' });
        return;
      }

      const access = await channelCopyService.getCommandAccessState({
        guildId: interaction.guildId!,
        discordUserId: interaction.user.id,
      });

      if (access.isErr() || !access.value.allowed) {
        await interaction.editReply({
          content:
            access.isErr() || access.value.authorizedUserCount > 0
              ? 'Your Discord ID is not on the `/channel-copy` allowlist for this destination server.'
              : 'This channel-copy worker is locked for this server until a super admin grants access.',
        });
        return;
      }

      const result = await channelCopyService.startCopyRun({
        sourceChannelId,
        destinationChannelId,
        requestedByDiscordUserId: interaction.user.id,
        destinationGuildId: interaction.guildId!,
        confirmToken: interaction.options.getString('confirm'),
        adapter: createDiscordRuntimeAdapter(interaction.client),
      });
```

```ts
// apps/channel-copy-worker/src/commands/channel-copy.ts
      if (result.isErr()) {
        await interaction.editReply({ content: mapChannelCopyError(result.error) });
        return;
      }

      if (result.value.status === 'awaiting_confirmation') {
        await interaction.editReply({
          content: `Destination channel is not empty. Rerun this command with confirm:\`${result.value.requiresConfirmToken}\`. Job ID: \`${result.value.jobId}\`.`,
        });
        return;
      }

      await interaction.editReply({
        content: `Copy complete. Job ID: \`${result.value.jobId}\`. Copied ${result.value.copiedMessageCount} message(s) and skipped ${result.value.skippedMessageCount}.`,
      });
      return;
    }
  },
};
```

```ts
// apps/channel-copy-worker/src/commands/channel-copy.ts
function createDiscordRuntimeAdapter(client: Client): ChannelCopyRuntimeAdapter {
  return {
    async getChannel({ channelId }) {
      const channel = await client.channels.fetch(channelId);
      if (
        !channel ||
        !channel.isTextBased() ||
        !('guildId' in channel) ||
        (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
      ) {
        throw new AppError('CHANNEL_COPY_INVALID_CHANNEL', 'Only text and announcement guild channels are supported.', 422);
      }

      return {
        id: channel.id,
        guildId: channel.guildId,
        kind: channel.type === ChannelType.GuildAnnouncement ? 'guildAnnouncement' : 'guildText',
      };
    },
    async countDestinationMessages({ channelId }) {
      const channel = (await client.channels.fetch(channelId)) as GuildTextBasedChannel;
      const batch = await channel.messages.fetch({ limit: 1 });
      return batch.size;
    },
    async listSourceMessages({ channelId, afterMessageId, limit }) {
      const channel = (await client.channels.fetch(channelId)) as GuildTextBasedChannel;
      const messages = await channel.messages.fetch({ limit });
      const ordered = [...messages.values()]
        .filter((message) => !afterMessageId || BigInt(message.id) > BigInt(afterMessageId))
        .sort((left, right) => Number(BigInt(left.id) - BigInt(right.id)));

      return Promise.all(
        ordered.map(async (message: Message) => ({
          id: message.id,
          content: message.content,
          attachments: await Promise.all(
            [...message.attachments.values()].map(async (attachment) => {
              const response = await fetch(attachment.url);
              const bytes = Buffer.from(await response.arrayBuffer());
              return {
                name: attachment.name ?? `${attachment.id}.bin`,
                contentType: attachment.contentType,
                data: bytes,
              };
            }),
          ),
          isSystem: message.system,
        })),
      );
    },
    async repostMessage({ channelId, content, attachments }) {
      const channel = (await client.channels.fetch(channelId)) as GuildTextBasedChannel;
      const sent = await channel.send({
        content: content.length > 0 ? content : undefined,
        files: attachments.map(
          (attachment) =>
            new AttachmentBuilder(attachment.data, {
              name: attachment.name,
              description: attachment.contentType ?? undefined,
            }),
        ),
      });
      return { destinationMessageId: sent.id };
    },
  };
}
```

- [ ] **Step 4: Run the targeted tests to verify the operator command passes**

Run: `pnpm exec vitest run apps/channel-copy-worker/src/commands/channel-copy.test.ts apps/channel-copy-worker/src/commands/activation.test.ts packages/core/tests/channel-copy-service.test.ts`

Expected: PASS with force-confirmation UX, same-channel rejection, status reporting, and adapter-backed copy execution.

- [ ] **Step 5: Commit**

```bash
git add apps/channel-copy-worker/src/commands/channel-copy.ts apps/channel-copy-worker/src/commands/channel-copy.test.ts apps/channel-copy-worker/src/index.ts packages/core/tests/channel-copy-service.test.ts
git commit -m "feat: add channel copy run command"
```

### Task 5: Update docs, run the full quality gate, push, deploy, and smoke test the new worker

**Files:**
- Modify: `README.md`
- Modify: `SETUP_GUIDE.md`
- Modify: `.env.example`
- Test: `packages/core/tests/tooling-config.test.ts`
- Test: `packages/core/tests/env.test.ts`

- [ ] **Step 1: Update README and setup guide for the new standalone worker**

```md
<!-- README.md -->
- `apps/channel-copy-worker`: separate-token Discord worker that copies one source channel into one destination channel one time, including attachments and cross-server copies.

- `CHANNEL_COPY_DISCORD_TOKEN`
- `CHANNEL_COPY_DISCORD_CLIENT_ID`

- Deploy channel-copy slash commands: `pnpm deploy:commands:channel-copy`

## Channel Copy Worker

- Runs from separate worker/token (`apps/channel-copy-worker`).
- `/channel-copy run source_channel_id:<id> destination_channel_id:<id> [confirm:<token>]` copies all source messages and attachments into the destination channel.
- The operator must be activated for the destination server only.
- `/activation grant guild_id:<server-id> user_id:<user-id>` remotely activates the channel-copy worker for a server without requiring the super admin to join that server.
- Channel-copy activation is isolated and does not unlock `/nuke`, `/sports`, `/join-gate`, or the sales bot.
```

```md
<!-- SETUP_GUIDE.md -->
- Add `CHANNEL_COPY_DISCORD_TOKEN` and `CHANNEL_COPY_DISCORD_CLIENT_ID` to `/var/www/voodoo/.env`.
- Run `pnpm deploy:commands:channel-copy` after first setup.
- Add a PM2 app entry named `voodoo-channel-copy` that runs the channel-copy worker in production.
- After deploy, run `pm2 start ecosystem.config.cjs --only voodoo-channel-copy --update-env` and `pm2 save`.
```

- [ ] **Step 2: Run the full required gate**

Run:

```bash
pnpm lint --fix
pnpm typecheck
pnpm test --coverage
pnpm build
```

Expected: all four commands succeed with no warnings and coverage remains at or above `95%`.

- [ ] **Step 3: Commit and push the completed implementation**

```bash
git add README.md SETUP_GUIDE.md .env.example package.json apps/channel-copy-worker packages/core drizzle
git commit -m "feat: add standalone channel copy worker"
git push origin main
```

- [ ] **Step 4: Deploy the updated repo to the droplet**

Run:

```bash
C:\Users\0\Desktop\store\dev\JSTS\Discord\Discord-Ticket-to-Sale-SaaS\.codex-tools\plink.exe -ssh root@139.59.188.119 -P 22 -pw "bLue@1Green" -hostkey "ssh-ed25519 255 SHA256:3jsqqU6PEstsodM8Sb63H9E8bXf3daWu8W8+z37jZBI" ". ~/.nvm/nvm.sh && nvm use 24.13.1 >/dev/null && cd /var/www/voodoo && git fetch origin && git checkout main && git pull --ff-only origin main && pnpm install && pnpm build && pnpm migrate && pnpm deploy:commands && /root/.nvm/versions/node/v24.13.1/bin/pm2 start ecosystem.config.cjs --only voodoo-channel-copy --update-env && /root/.nvm/versions/node/v24.13.1/bin/pm2 save"
```

Expected: `/var/www/voodoo` matches the pushed `main` commit, the new channel-copy worker is registered in PM2, and slash commands are redeployed with the new worker included.

- [ ] **Step 5: Smoke test the deployed worker**

Run:

```bash
C:\Users\0\Desktop\store\dev\JSTS\Discord\Discord-Ticket-to-Sale-SaaS\.codex-tools\plink.exe -ssh root@139.59.188.119 -P 22 -pw "bLue@1Green" -hostkey "ssh-ed25519 255 SHA256:3jsqqU6PEstsodM8Sb63H9E8bXf3daWu8W8+z37jZBI" ". ~/.nvm/nvm.sh && nvm use 24.13.1 >/dev/null && cd /var/www/voodoo && git rev-parse HEAD && /root/.nvm/versions/node/v24.13.1/bin/pm2 list && /root/.nvm/versions/node/v24.13.1/bin/pm2 logs voodoo-channel-copy --lines 50 --nostream"
```

Expected: the reported commit hash matches the pushed commit, PM2 shows `voodoo-channel-copy` online, and the logs show the worker reaching `channel-copy-worker ready` without startup errors.
