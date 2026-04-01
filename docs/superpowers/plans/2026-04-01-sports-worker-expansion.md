# Sports Worker Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the sports worker to support live event channels, highlights, match center, standings, fixtures, results, team/player lookups, sports-only-with-events daily publishing, and a `00:01` default schedule using only TheSportsDB.

**Architecture:** Keep TheSportsDB as the only provider, extend the shared sports data/service layer for the new read models, add a dedicated live-event repository/service for channel lifecycle state, split runtime responsibility between the existing daily publisher and a new live sync loop, and add one slash command file per new lookup surface. Preserve the existing guild-level activation and config model while making the daily publisher create or publish only the sport channels that actually have events that day.

**Tech Stack:** TypeScript, discord.js 14.25.1, Drizzle ORM/MySQL, Vitest, neverthrow, p-queue, p-retry

---

### Task 1: Add live-event persistence and move the sports default publish time to `00:01`

**Files:**
- Create: `drizzle/migrations/0022_sports_live_event_channels.sql`
- Create: `drizzle/migrations/meta/0022_snapshot.json`
- Modify: `drizzle/migrations/meta/_journal.json`
- Modify: `packages/core/src/infra/db/schema/tables.ts`
- Modify: `packages/core/src/infra/db/schema/index.ts`
- Modify: `packages/core/src/config/env.ts`
- Modify: `.env.example`
- Test: `packages/core/tests/sports-schedule.test.ts`
- Test: `packages/core/tests/env.test.ts`

- [ ] **Step 1: Write the failing schema/default-time tests**

```ts
// packages/core/tests/sports-schedule.test.ts
it('computes the next UK run using the new default sports publish time', () => {
  const now = new Date('2026-03-20T00:00:30.000Z');
  const nextRun = computeNextRunAtUtc({
    timezone: 'Europe/London',
    timeHhMm: '00:01',
    now,
  });

  expect(nextRun.toISOString()).toBe('2026-03-20T00:01:00.000Z');
});
```

```ts
// packages/core/tests/env.test.ts
it('uses 00:01 as the sports default publish time', () => {
  delete process.env.SPORTS_DEFAULT_PUBLISH_TIME;
  resetEnvForTests();

  expect(getEnv().SPORTS_DEFAULT_PUBLISH_TIME).toBe('00:01');
});
```

- [ ] **Step 2: Run the targeted tests to confirm the current defaults fail**

Run: `pnpm exec vitest run packages/core/tests/sports-schedule.test.ts packages/core/tests/env.test.ts`

Expected: FAIL because the code and env defaults still use `01:00`.

- [ ] **Step 3: Add the new DB table and update the sports default time**

```ts
// packages/core/src/infra/db/schema/tables.ts
export const sportsLiveEventChannels = mysqlTable(
  'sports_live_event_channels',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    sportName: varchar('sport_name', { length: 80 }).notNull(),
    eventId: varchar('event_id', { length: 32 }).notNull(),
    eventName: varchar('event_name', { length: 160 }).notNull(),
    sportChannelId: varchar('sport_channel_id', { length: 32 }).notNull(),
    eventChannelId: varchar('event_channel_id', { length: 32 }),
    status: mysqlEnum('status', ['scheduled', 'live', 'finished', 'cleanup_due', 'deleted', 'failed'])
      .notNull()
      .default('scheduled'),
    kickoffAtUtc: timestamp('kickoff_at_utc', { mode: 'date' }).notNull(),
    lastScoreSnapshot: json('last_score_snapshot').$type<Record<string, unknown> | null>(),
    lastStateSnapshot: json('last_state_snapshot').$type<Record<string, unknown> | null>(),
    lastSyncedAtUtc: timestamp('last_synced_at_utc', { mode: 'date' }),
    finishedAtUtc: timestamp('finished_at_utc', { mode: 'date' }),
    deleteAfterUtc: timestamp('delete_after_utc', { mode: 'date' }),
    highlightsPosted: boolean('highlights_posted').notNull().default(false),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    guildEventUnique: uniqueIndex('sports_live_event_channels_guild_event_uq').on(table.guildId, table.eventId),
    guildEventChannelUnique: uniqueIndex('sports_live_event_channels_guild_event_channel_uq').on(table.guildId, table.eventChannelId),
    statusSyncIdx: index('sports_live_event_channels_status_sync_idx').on(table.status, table.lastSyncedAtUtc),
    statusDeleteIdx: index('sports_live_event_channels_status_delete_idx').on(table.status, table.deleteAfterUtc),
    guildIdx: index('sports_live_event_channels_guild_idx').on(table.guildId),
  }),
);
```

```ts
// packages/core/src/config/env.ts
SPORTS_DEFAULT_PUBLISH_TIME: z.string().default('00:01'),
```

```env
# .env.example
SPORTS_DEFAULT_PUBLISH_TIME=00:01
```

```sql
-- drizzle/migrations/0022_sports_live_event_channels.sql
CREATE TABLE `sports_live_event_channels` (
  `id` varchar(26) NOT NULL,
  `guild_id` varchar(32) NOT NULL,
  `sport_name` varchar(80) NOT NULL,
  `event_id` varchar(32) NOT NULL,
  `event_name` varchar(160) NOT NULL,
  `sport_channel_id` varchar(32) NOT NULL,
  `event_channel_id` varchar(32),
  `status` enum('scheduled','live','finished','cleanup_due','deleted','failed') NOT NULL DEFAULT 'scheduled',
  `kickoff_at_utc` timestamp NOT NULL,
  `last_score_snapshot` json,
  `last_state_snapshot` json,
  `last_synced_at_utc` timestamp,
  `finished_at_utc` timestamp,
  `delete_after_utc` timestamp,
  `highlights_posted` boolean NOT NULL DEFAULT false,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `sports_live_event_channels_id` PRIMARY KEY(`id`),
  CONSTRAINT `sports_live_event_channels_guild_event_uq` UNIQUE(`guild_id`,`event_id`),
  CONSTRAINT `sports_live_event_channels_guild_event_channel_uq` UNIQUE(`guild_id`,`event_channel_id`)
);
```

- [ ] **Step 4: Re-run the targeted tests**

Run: `pnpm exec vitest run packages/core/tests/sports-schedule.test.ts packages/core/tests/env.test.ts`

Expected: PASS with the new `00:01` default reflected in both helpers and env parsing.

- [ ] **Step 5: Commit the persistence/default-time foundation**

```bash
git add drizzle/migrations/0022_sports_live_event_channels.sql drizzle/migrations/meta/0022_snapshot.json drizzle/migrations/meta/_journal.json packages/core/src/infra/db/schema/tables.ts packages/core/src/infra/db/schema/index.ts packages/core/src/config/env.ts .env.example packages/core/tests/sports-schedule.test.ts packages/core/tests/env.test.ts
git commit -m "feat: add sports live event persistence"
```

### Task 2: Add repository and service support for live event channel lifecycle state

**Files:**
- Create: `packages/core/src/repositories/sports-live-event-repository.ts`
- Create: `packages/core/src/services/sports-live-event-service.ts`
- Create: `packages/core/tests/sports-live-event-service.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing live-event service tests**

```ts
// packages/core/tests/sports-live-event-service.test.ts
it('creates one tracked row per guild and event', async () => {
  const service = new SportsLiveEventService(new SportsLiveEventRepository());

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
  expect(second.value.id).toBe(first.value.id);
});
```

```ts
it('marks finished events for cleanup three hours later', async () => {
  const result = await service.markFinished({
    guildId: 'guild-1',
    eventId: 'evt-1',
    finishedAtUtc: new Date('2026-03-20T15:00:00.000Z'),
  });

  expect(result.value.deleteAfterUtc.toISOString()).toBe('2026-03-20T18:00:00.000Z');
  expect(result.value.status).toBe('cleanup_due');
});
```

- [ ] **Step 2: Run the new core service test**

Run: `pnpm exec vitest run packages/core/tests/sports-live-event-service.test.ts`

Expected: FAIL because neither the repository nor service exists yet.

- [ ] **Step 3: Implement repository CRUD and the lifecycle service**

```ts
// packages/core/src/repositories/sports-live-event-repository.ts
export class SportsLiveEventRepository {
  public async upsertTrackedEvent(input: {
    guildId: string;
    sportName: string;
    eventId: string;
    eventName: string;
    sportChannelId: string;
    kickoffAtUtc: Date;
  }): Promise<SportsLiveEventChannelRecord> {
    const existing = await this.getByGuildAndEvent({
      guildId: input.guildId,
      eventId: input.eventId,
    });

    if (existing) {
      await this.db
        .update(sportsLiveEventChannels)
        .set({
          sportName: input.sportName,
          eventName: input.eventName,
          sportChannelId: input.sportChannelId,
          kickoffAtUtc: input.kickoffAtUtc,
          updatedAt: new Date(),
        })
        .where(eq(sportsLiveEventChannels.id, existing.id));

      return (await this.getByGuildAndEvent({
        guildId: input.guildId,
        eventId: input.eventId,
      })) as SportsLiveEventChannelRecord;
    }

    await this.db.insert(sportsLiveEventChannels).values({
      id: ulid(),
      guildId: input.guildId,
      sportName: input.sportName,
      eventId: input.eventId,
      eventName: input.eventName,
      sportChannelId: input.sportChannelId,
      kickoffAtUtc: input.kickoffAtUtc,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return (await this.getByGuildAndEvent({
      guildId: input.guildId,
      eventId: input.eventId,
    })) as SportsLiveEventChannelRecord;
  }

  public async markFinished(input: {
    guildId: string;
    eventId: string;
    finishedAtUtc: Date;
    deleteAfterUtc: Date;
  }): Promise<SportsLiveEventChannelRecord | null> {
    await this.db
      .update(sportsLiveEventChannels)
      .set({
        status: 'cleanup_due',
        finishedAtUtc: input.finishedAtUtc,
        deleteAfterUtc: input.deleteAfterUtc,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sportsLiveEventChannels.guildId, input.guildId),
          eq(sportsLiveEventChannels.eventId, input.eventId),
        ),
      );

    return this.getByGuildAndEvent({
      guildId: input.guildId,
      eventId: input.eventId,
    });
  }
}
```

```ts
// packages/core/src/services/sports-live-event-service.ts
export class SportsLiveEventService {
  public async markFinished(input: {
    guildId: string;
    eventId: string;
    finishedAtUtc: Date;
  }): Promise<Result<SportsLiveEventChannelSummary, AppError>> {
    const deleteAfterUtc = new Date(input.finishedAtUtc.getTime() + 3 * 60 * 60 * 1000);
    const record = await this.repository.markFinished({
      guildId: input.guildId,
      eventId: input.eventId,
      finishedAtUtc: input.finishedAtUtc,
      deleteAfterUtc,
    });

    if (!record) {
      return err(new AppError('SPORTS_LIVE_EVENT_NOT_FOUND', 'Tracked live event not found.', 404));
    }

    return ok(mapSportsLiveEventChannelSummary(record));
  }
}
```

```ts
// packages/core/src/index.ts
export * from './repositories/sports-live-event-repository.js';
export * from './services/sports-live-event-service.js';
```

- [ ] **Step 4: Re-run the live-event service test**

Run: `pnpm exec vitest run packages/core/tests/sports-live-event-service.test.ts`

Expected: PASS with idempotent upsert and cleanup scheduling behavior.

- [ ] **Step 5: Commit the new live-event service layer**

```bash
git add packages/core/src/repositories/sports-live-event-repository.ts packages/core/src/services/sports-live-event-service.ts packages/core/src/index.ts packages/core/tests/sports-live-event-service.test.ts
git commit -m "feat: add sports live event service"
```

### Task 3: Extend `SportsDataService` for live, highlights, match center, standings, fixtures, results, team, and player lookup

**Files:**
- Modify: `packages/core/src/services/sports-data-service.ts`
- Modify: `packages/core/tests/sports-data-service.test.ts`

- [ ] **Step 1: Write the failing data-service tests for the new provider methods**

```ts
// packages/core/tests/sports-data-service.test.ts
it('maps live scores into live event summaries', async () => {
  const service = new SportsDataService();
  const result = await service.listLiveEvents({
    timezone: 'Europe/London',
    broadcastCountry: 'United Kingdom',
  });

  expect(result.isOk()).toBe(true);
  expect(result.value[0]).toMatchObject({
    eventId: 'evt-1',
    sportName: 'Soccer',
    statusLabel: 'Live',
    scoreLabel: '2-1',
  });
});
```

```ts
it('returns highlight links for a finished event', async () => {
  const result = await service.getEventHighlights({ eventId: 'evt-1' });

  expect(result.isOk()).toBe(true);
  expect(result.value?.videoUrl).toContain('youtube');
});
```

```ts
it('returns standings, fixtures, results, team, and player lookup payloads', async () => {
  expect((await service.getStandings({ league: 'Scottish Premiership' })).isOk()).toBe(true);
  expect((await service.getFixtures({ query: 'Rangers' })).isOk()).toBe(true);
  expect((await service.getResults({ query: 'Rangers' })).isOk()).toBe(true);
  expect((await service.getTeamDetails({ query: 'Rangers' })).isOk()).toBe(true);
  expect((await service.getPlayerDetails({ query: 'James Tavernier' })).isOk()).toBe(true);
});
```

- [ ] **Step 2: Run the provider test file and confirm the missing methods fail**

Run: `pnpm exec vitest run packages/core/tests/sports-data-service.test.ts`

Expected: FAIL with missing methods and unmapped response shapes.

- [ ] **Step 3: Add the new read models and provider methods to `SportsDataService`**

```ts
// packages/core/src/services/sports-data-service.ts
export type SportsLiveEvent = {
  eventId: string;
  eventName: string;
  sportName: string | null;
  leagueName: string | null;
  statusLabel: string;
  scoreLabel: string | null;
  startTimeUkLabel: string | null;
  imageUrl: string | null;
  broadcasters: SportsBroadcast[];
};

public async listLiveEvents(input: {
  timezone: string;
  broadcastCountry: string;
}): Promise<Result<SportsLiveEvent[], AppError>> {
  const payload = await this.requestV2<{ events?: SportsApiV2LiveEvent[]; livescore?: SportsApiV2LiveEvent[] }>({
    path: '/livescore/all',
  });

  const rows = payload.events ?? payload.livescore ?? [];
  const mapped = await Promise.all(
    rows.map(async (row) => {
      const eventId = firstNonEmpty(row.idEvent);
      if (!eventId) {
        return null;
      }

      const detailsResult = await this.getEventDetails({
        eventId,
        timezone: input.timezone,
        broadcastCountry: input.broadcastCountry,
      });
      const details = detailsResult.isOk() ? detailsResult.value : null;

      return {
        eventId,
        eventName: firstNonEmpty(row.strEvent) ?? 'Unknown event',
        sportName: firstNonEmpty(row.strSport),
        leagueName: firstNonEmpty(row.strLeague),
        statusLabel: firstNonEmpty(row.strStatus, row.strProgress) ?? 'Live',
        scoreLabel: [firstNonEmpty(row.intHomeScore), firstNonEmpty(row.intAwayScore)].filter(Boolean).join('-') || null,
        startTimeUkLabel: details?.startTimeUkLabel ?? null,
        imageUrl: details?.imageUrl ?? firstNonEmpty(row.strThumb),
        broadcasters: details?.broadcasters ?? [],
      } satisfies SportsLiveEvent;
    }),
  );

  return ok(mapped.filter((row): row is SportsLiveEvent => row !== null));
}

public async getEventHighlights(input: {
  eventId: string;
}): Promise<Result<SportsEventHighlight | null, AppError>> {
  const payload = await this.requestV2<{ lookup?: SportsApiV2EventLookupWithVideo[] }>({
    path: `/lookup/event/${encodeURIComponent(input.eventId)}`,
  });
  const event = payload.lookup?.[0];

  if (!event || !firstNonEmpty(event.strVideo)) {
    return ok(null);
  }

  return ok({
    eventId: firstNonEmpty(event.idEvent) ?? input.eventId,
    eventName: firstNonEmpty(event.strEvent) ?? 'Unknown event',
    videoUrl: firstNonEmpty(event.strVideo) as string,
    thumbnailUrl: firstNonEmpty(event.strThumb, event.strPoster),
  });
}

public async getStandings(input: { league: string }): Promise<Result<SportsStandingRow[], AppError>> {
  const league = await this.resolveLeague(input.league);
  const payload = await this.requestV2<{ table?: SportsApiV2StandingRow[] }>({
    path: `/lookuptable.php?l=${encodeURIComponent(league.idLeague)}`,
  });

  return ok(
    (payload.table ?? []).map((row) => ({
      name: firstNonEmpty(row.strTeam) ?? 'Unknown team',
      position: Number(firstNonEmpty(row.intRank) ?? '0'),
      played: Number(firstNonEmpty(row.intPlayed) ?? '0'),
      points: Number(firstNonEmpty(row.intPoints) ?? '0'),
      goalDifference: Number(firstNonEmpty(row.intGoalDifference) ?? '0'),
    })),
  );
}
```

```ts
public async getFixtures(input: { query: string }): Promise<Result<SportsSearchResult[], AppError>> {
  const team = await this.resolveTeam(input.query);
  const payload = await this.requestV2<SportsApiV2TeamSchedulePayload>({
    path: `/schedule/next/team/${encodeURIComponent(team.idTeam)}`,
  });

  return ok(this.mapTeamScheduleResults(payload.schedule ?? []));
}

public async getResults(input: { query: string }): Promise<Result<SportsSearchResult[], AppError>> {
  const team = await this.resolveTeam(input.query);
  const payload = await this.requestV2<SportsApiV2TeamSchedulePayload>({
    path: `/schedule/previous/team/${encodeURIComponent(team.idTeam)}`,
  });

  return ok(this.mapTeamScheduleResults(payload.schedule ?? []));
}
```

- [ ] **Step 4: Re-run the provider test file**

Run: `pnpm exec vitest run packages/core/tests/sports-data-service.test.ts`

Expected: PASS with stable mappings for all new provider-backed reads.

- [ ] **Step 5: Commit the provider expansion**

```bash
git add packages/core/src/services/sports-data-service.ts packages/core/tests/sports-data-service.test.ts
git commit -m "feat: expand sports data service reads"
```

### Task 4: Change daily publishing to only create/publish sport channels that have events and add a restart-safe live-event sync runtime

**Files:**
- Create: `apps/sports-worker/src/live-event-runtime.ts`
- Create: `apps/sports-worker/src/live-event-runtime.test.ts`
- Modify: `apps/sports-worker/src/sports-runtime.ts`
- Modify: `apps/sports-worker/src/index.ts`
- Modify: `apps/sports-worker/src/ui/sports-embeds.ts`
- Modify: `apps/sports-worker/src/commands/sports.test.ts`

- [ ] **Step 1: Write the failing runtime tests**

```ts
// apps/sports-worker/src/live-event-runtime.test.ts
it('creates one event channel for each televised live event', async () => {
  const result = await reconcileLiveEventsForGuild({
    guild,
    timezone: 'Europe/London',
    broadcastCountry: 'United Kingdom',
  });

  expect(result.createdChannelCount).toBe(2);
  expect(guild.channels.create).toHaveBeenCalledWith(
    expect.objectContaining({ name: expect.stringMatching(/^live-/) }),
  );
});
```

```ts
it('deletes finished event channels after the three-hour cleanup window', async () => {
  await runPendingLiveEventCleanup({ guild, now: new Date('2026-03-20T18:05:00.000Z') });

  expect(eventChannel.delete).toHaveBeenCalled();
});
```

```ts
// apps/sports-worker/src/commands/sports.test.ts
it('reports zero empty channels after switching to sports-with-events-only publishing', async () => {
  await sportsCommand.execute(interaction);

  expect(editReply).toHaveBeenCalledWith({
    content: expect.not.stringContaining('Empty sport channels today'),
  });
});
```

- [ ] **Step 2: Run the sports runtime tests**

Run: `pnpm exec vitest run apps/sports-worker/src/live-event-runtime.test.ts apps/sports-worker/src/commands/sports.test.ts`

Expected: FAIL because the new runtime does not exist and the daily publisher still posts empty channels.

- [ ] **Step 3: Implement the live-event runtime and tighten daily publishing**

```ts
// apps/sports-worker/src/sports-runtime.ts
const listingsBySport = new Map(listingsResult.value.map((entry) => [entry.sportName, entry.listings]));
const activeBindings = new Map(
  bindings.filter((binding) => (listingsBySport.get(binding.sportName)?.length ?? 0) > 0)
    .map((binding) => [binding.sportName, binding]),
);
```

```ts
// apps/sports-worker/src/live-event-runtime.ts
const discordWriteQueue = new PQueue({
  concurrency: 1,
  intervalCap: 3,
  interval: 1000,
});

export async function reconcileLiveEventsForGuild(input: {
  guild: Guild;
  timezone: string;
  broadcastCountry: string;
}): Promise<LiveEventSyncResult> {
  const liveResult = await sportsDataService.listLiveEvents({
    timezone: input.timezone,
    broadcastCountry: input.broadcastCountry,
  });
  if (liveResult.isErr()) {
    throw liveResult.error;
  }

  let createdChannelCount = 0;
  for (const event of liveResult.value) {
    const tracked = await sportsLiveEventService.upsertTrackedEvent({
      guildId: input.guild.id,
      sportName: event.sportName ?? 'Unknown sport',
      eventId: event.eventId,
      eventName: event.eventName,
      sportChannelId: resolveSportChannelId(event),
      kickoffAtUtc: resolveKickoffAtUtc(event),
    });
    if (tracked.isErr()) {
      throw tracked.error;
    }

    if (!tracked.value.eventChannelId) {
      await discordWriteQueue.add(async () => {
        const channel = await input.guild.channels.create({
          name: buildLiveEventChannelName(event.eventName),
          type: ChannelType.GuildText,
          parent: tracked.value.sportChannelId,
        });
        await postOrUpdateLiveMatchCenter({ channel, event });
        await sportsLiveEventService.attachEventChannel({
          guildId: input.guild.id,
          eventId: event.eventId,
          eventChannelId: channel.id,
          lastScoreSnapshot: { scoreLabel: event.scoreLabel },
        });
      });
      createdChannelCount += 1;
    }
  }

  return {
    trackedEventCount: liveResult.value.length,
    createdChannelCount,
  };
}
```

```ts
// apps/sports-worker/src/index.ts
client.once(Events.ClientReady, () => {
  startSportsScheduler(client, env.SPORTS_POLL_INTERVAL_MS);
  startLiveEventScheduler(client, env.SPORTS_POLL_INTERVAL_MS);
});
```

- [ ] **Step 4: Re-run the runtime tests**

Run: `pnpm exec vitest run apps/sports-worker/src/live-event-runtime.test.ts apps/sports-worker/src/commands/sports.test.ts`

Expected: PASS with sports-only-with-events publishing and restart-safe live-event lifecycle behavior.

- [ ] **Step 5: Commit the runtime changes**

```bash
git add apps/sports-worker/src/live-event-runtime.ts apps/sports-worker/src/live-event-runtime.test.ts apps/sports-worker/src/sports-runtime.ts apps/sports-worker/src/index.ts apps/sports-worker/src/ui/sports-embeds.ts apps/sports-worker/src/commands/sports.test.ts
git commit -m "feat: add sports live channel runtime"
```

### Task 5: Add the new lookup commands and `/sports live-status`

**Files:**
- Create: `apps/sports-worker/src/commands/live.ts`
- Create: `apps/sports-worker/src/commands/highlights.ts`
- Create: `apps/sports-worker/src/commands/match.ts`
- Create: `apps/sports-worker/src/commands/standings.ts`
- Create: `apps/sports-worker/src/commands/fixtures.ts`
- Create: `apps/sports-worker/src/commands/results.ts`
- Create: `apps/sports-worker/src/commands/team.ts`
- Create: `apps/sports-worker/src/commands/player.ts`
- Create: `apps/sports-worker/src/commands/live.test.ts`
- Create: `apps/sports-worker/src/commands/highlights.test.ts`
- Create: `apps/sports-worker/src/commands/match.test.ts`
- Create: `apps/sports-worker/src/commands/standings.test.ts`
- Create: `apps/sports-worker/src/commands/fixtures.test.ts`
- Create: `apps/sports-worker/src/commands/results.test.ts`
- Create: `apps/sports-worker/src/commands/team.test.ts`
- Create: `apps/sports-worker/src/commands/player.test.ts`
- Modify: `apps/sports-worker/src/commands/sports.ts`
- Modify: `apps/sports-worker/src/deploy-commands.ts`
- Modify: `apps/sports-worker/src/index.ts`

- [ ] **Step 1: Write the failing command tests**

```ts
// apps/sports-worker/src/commands/live.test.ts
it('returns current live events with embeds', async () => {
  await liveCommand.execute(interaction);

  expect(editReply).toHaveBeenCalledWith({
    content: expect.stringContaining('Found 2 live televised events'),
    embeds: [expect.any(Object), expect.any(Object)],
  });
});
```

```ts
// apps/sports-worker/src/commands/highlights.test.ts
it('returns on-demand highlights for a finished event', async () => {
  await highlightsCommand.execute(interaction);

  expect(editReply).toHaveBeenCalledWith({
    content: expect.stringContaining('Highlights for'),
    embeds: [expect.any(Object)],
  });
});
```

```ts
// apps/sports-worker/src/commands/sports.test.ts
it('shows live-status with tracked events and pending cleanup counts', async () => {
  await sportsCommand.execute(interaction);

  expect(editReply).toHaveBeenCalledWith({
    content: expect.stringContaining('Tracked live events'),
  });
});
```

- [ ] **Step 2: Run the command test set**

Run: `pnpm exec vitest run apps/sports-worker/src/commands/*.test.ts`

Expected: FAIL because the new commands and the `live-status` subcommand are not wired yet.

- [ ] **Step 3: Implement one command file per lookup surface and register them**

```ts
// apps/sports-worker/src/commands/live.ts
export const liveCommand = {
  data: new SlashCommandBuilder()
    .setName('live')
    .setDescription('Show live televised events')
    .addStringOption((option) => option.setName('sport').setDescription('Optional sport filter'))
    .addStringOption((option) => option.setName('league').setDescription('Optional league filter')),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await sportsDataService.listLiveEvents({
      timezone: getEnv().SPORTS_DEFAULT_TIMEZONE,
      broadcastCountry: getEnv().SPORTS_BROADCAST_COUNTRY,
    });
    if (result.isErr()) {
      await interaction.editReply({ content: mapSportsError(result.error) });
      return;
    }

    const embeds = result.value.map((event) => buildLiveEventEmbed(event)).slice(0, 10);
    await interaction.editReply({
      content: `Found ${result.value.length} live televised event${result.value.length === 1 ? '' : 's'}.`,
      embeds,
    });
  },
};
```

```ts
// apps/sports-worker/src/commands/sports.ts
.addSubcommand((subcommand) =>
  subcommand
    .setName('live-status')
    .setDescription('Show live event tracking, cleanup, and sync health'),
)
```

```ts
// apps/sports-worker/src/deploy-commands.ts
const payload = [
  sportsCommand.data.toJSON(),
  searchCommand.data.toJSON(),
  liveCommand.data.toJSON(),
  highlightsCommand.data.toJSON(),
  matchCommand.data.toJSON(),
  standingsCommand.data.toJSON(),
  fixturesCommand.data.toJSON(),
  resultsCommand.data.toJSON(),
  teamCommand.data.toJSON(),
  playerCommand.data.toJSON(),
  activationCommand.data.toJSON(),
];
```

- [ ] **Step 4: Re-run the command test set**

Run: `pnpm exec vitest run apps/sports-worker/src/commands/*.test.ts`

Expected: PASS with the new commands registered and the `/sports live-status` branch working.

- [ ] **Step 5: Commit the command surface**

```bash
git add apps/sports-worker/src/commands/live.ts apps/sports-worker/src/commands/highlights.ts apps/sports-worker/src/commands/match.ts apps/sports-worker/src/commands/standings.ts apps/sports-worker/src/commands/fixtures.ts apps/sports-worker/src/commands/results.ts apps/sports-worker/src/commands/team.ts apps/sports-worker/src/commands/player.ts apps/sports-worker/src/commands/*.test.ts apps/sports-worker/src/commands/sports.ts apps/sports-worker/src/deploy-commands.ts apps/sports-worker/src/index.ts
git commit -m "feat: add sports lookup commands"
```

### Task 6: Auto-post highlights in live event channels and harden restart recovery

**Files:**
- Modify: `apps/sports-worker/src/live-event-runtime.ts`
- Modify: `apps/sports-worker/src/live-event-runtime.test.ts`
- Modify: `packages/core/src/services/sports-live-event-service.ts`
- Modify: `packages/core/tests/sports-live-event-service.test.ts`

- [ ] **Step 1: Write the failing highlight/recovery tests**

```ts
// apps/sports-worker/src/live-event-runtime.test.ts
it('posts highlights once when a finished event gains a highlight video', async () => {
  await reconcileLiveEventsForGuild({ guild, timezone: 'Europe/London', broadcastCountry: 'United Kingdom' });
  await reconcileLiveEventsForGuild({ guild, timezone: 'Europe/London', broadcastCountry: 'United Kingdom' });

  expect(eventChannel.send).toHaveBeenCalledTimes(1);
  expect(eventChannel.send).toHaveBeenCalledWith({
    content: expect.stringContaining('Highlights'),
  });
});
```

```ts
it('recovers tracked live channels after worker restart without duplicating them', async () => {
  await resumeTrackedLiveEvents({ client, now: new Date('2026-03-20T16:00:00.000Z') });

  expect(guild.channels.create).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the live runtime and service tests**

Run: `pnpm exec vitest run apps/sports-worker/src/live-event-runtime.test.ts packages/core/tests/sports-live-event-service.test.ts`

Expected: FAIL because highlight-posted state and restart reconciliation are incomplete.

- [ ] **Step 3: Implement highlight autopost guards and startup reconciliation**

```ts
// apps/sports-worker/src/live-event-runtime.ts
if (tracked.status === 'finished' || tracked.status === 'cleanup_due') {
  const highlightResult = await sportsDataService.getEventHighlights({ eventId: tracked.eventId });
  if (highlightResult.isOk() && highlightResult.value && !tracked.highlightsPosted) {
    await eventChannel.send({ content: `Highlights: ${highlightResult.value.videoUrl}` });
    await sportsLiveEventService.markHighlightsPosted({
      guildId: tracked.guildId,
      eventId: tracked.eventId,
    });
  }
}
```

```ts
export async function resumeTrackedLiveEvents(input: {
  client: Client;
  now: Date;
}): Promise<void> {
  const trackedResult = await sportsLiveEventService.listRecoverableEvents();
  if (trackedResult.isErr()) {
    throw trackedResult.error;
  }

  for (const tracked of trackedResult.value) {
    const guild = await input.client.guilds.fetch(tracked.guildId);
    const channel = tracked.eventChannelId
      ? await guild.channels.fetch(tracked.eventChannelId).catch(() => null)
      : null;

    if (!channel && tracked.status !== 'deleted') {
      await sportsLiveEventService.markFailed({
        guildId: tracked.guildId,
        eventId: tracked.eventId,
      });
      continue;
    }

    if (tracked.deleteAfterUtc && tracked.deleteAfterUtc <= input.now) {
      await runPendingLiveEventCleanup({ guild, now: input.now });
    }
  }
}
```

- [ ] **Step 4: Re-run the live runtime and service tests**

Run: `pnpm exec vitest run apps/sports-worker/src/live-event-runtime.test.ts packages/core/tests/sports-live-event-service.test.ts`

Expected: PASS with single-post highlight behavior and duplicate-safe restart recovery.

- [ ] **Step 5: Commit the highlight/recovery hardening**

```bash
git add apps/sports-worker/src/live-event-runtime.ts apps/sports-worker/src/live-event-runtime.test.ts packages/core/src/services/sports-live-event-service.ts packages/core/tests/sports-live-event-service.test.ts
git commit -m "feat: add sports live recovery and highlights"
```

### Task 7: Update docs, run the full quality gate, deploy, and smoke test

**Files:**
- Modify: `README.md`
- Modify: `SETUP_GUIDE.md`

- [ ] **Step 1: Write the doc updates**

```md
<!-- README.md -->
- Default sports publish time is now `00:01` in `Europe/London`.
- Persistent sport channels are only published for sports that have events that day.
- Live televised events now get temporary `live-*` event channels that auto-delete 3 hours after finish.
- New commands: `/live`, `/highlights`, `/match`, `/standings`, `/fixtures`, `/results`, `/team`, `/player`, and `/sports live-status`.
```

```md
<!-- SETUP_GUIDE.md -->
Set `SPORTS_DEFAULT_PUBLISH_TIME=00:01`.
Run `pnpm deploy:commands:sports` after adding the new sports lookup commands.
Confirm the sports worker can create and delete temporary event channels in the target server.
```

- [ ] **Step 2: Run the full required quality gate**

Run: `pnpm lint --fix`
Expected: PASS with no warnings.

Run: `pnpm typecheck`
Expected: PASS across all workspace packages.

Run: `pnpm test --coverage`
Expected: PASS with coverage meeting or exceeding the repo target.

Run: `pnpm build`
Expected: PASS for `@voodoo/core`, `@voodoo/sports-worker`, and the rest of the workspace.

- [ ] **Step 3: Commit the completed implementation**

```bash
git add README.md SETUP_GUIDE.md
git add apps/sports-worker packages/core drizzle .env.example
git commit -m "feat: expand sports worker live features"
```

- [ ] **Step 4: Push and update the droplet**

Run: `git push origin main`
Expected: PASS with the new commits uploaded.

Run: `C:\Users\0\Desktop\store\dev\JSTS\Discord\Discord-Ticket-to-Sale-SaaS\.codex-tools\plink.exe -ssh root@139.59.188.119 -P 22 -pw "bLue@1Green" -hostkey "ssh-ed25519 255 SHA256:3jsqqU6PEstsodM8Sb63H9E8bXf3daWu8W8+z37jZBI" "cd /var/www/voodoo && git pull && pnpm install && pnpm migrate && pnpm deploy:commands:sports && pnpm build && pm2 restart voodoo-sports --update-env"`
Expected: PASS with `/var/www/voodoo` updated to the latest pushed commit.

- [ ] **Step 5: Smoke test the changed sports behavior on the droplet**

```bash
C:\Users\0\Desktop\store\dev\JSTS\Discord\Discord-Ticket-to-Sale-SaaS\.codex-tools\plink.exe -ssh root@139.59.188.119 -P 22 -pw "bLue@1Green" -hostkey "ssh-ed25519 255 SHA256:3jsqqU6PEstsodM8Sb63H9E8bXf3daWu8W8+z37jZBI" "cd /var/www/voodoo && pm2 logs voodoo-sports --lines 100 --nostream"
```

Check for:

- the worker booting cleanly
- the scheduler loop starting
- no migration errors
- no command registration failures
- no live-sync crash loops
