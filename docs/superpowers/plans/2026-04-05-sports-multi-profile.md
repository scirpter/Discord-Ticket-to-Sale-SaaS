# Sports Multi-Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-country sports profiles with separate daily and live categories per profile, keep a shared `00:01` guild publish time, and fix live-event channels so they update during the live window instead of only appearing after finish.

**Architecture:** Split the current single guild sports config into shared guild schedule settings plus per-guild sports profiles. Move daily channel bindings and tracked live events to profile scope, then update the daily publisher, live-event runtime, and slash commands to resolve and operate on profiles instead of a single guild-wide country/category pair.

**Tech Stack:** TypeScript, discord.js 14.x, Drizzle ORM/MySQL, Vitest, neverthrow, p-queue, p-retry

---

### Task 1: Add profile-scoped schema and migrate the existing single-profile data

**Files:**
- Create: `drizzle/migrations/0024_sports_multi_profiles.sql`
- Create: `drizzle/migrations/meta/0024_snapshot.json`
- Modify: `drizzle/migrations/meta/_journal.json`
- Modify: `packages/core/src/infra/db/schema/tables.ts`
- Modify: `packages/core/src/infra/db/schema/index.ts`
- Create: `packages/core/tests/sports-service.test.ts`
- Test: `packages/core/tests/sports-live-event-service.test.ts`

- [ ] **Step 1: Write the failing migration/service tests**

```ts
// packages/core/tests/sports-service.test.ts
it('lists migrated sports profiles for a guild that previously had one guild-wide sports config', async () => {
  const repository = createSportsRepository({
    guildConfig: {
      guildId: 'guild-1',
      timezone: 'Europe/London',
      localTimeHhMm: '00:01',
    },
    profiles: [
      {
        profileId: 'profile-uk',
        guildId: 'guild-1',
        slug: 'uk',
        label: 'UK',
        broadcastCountry: 'United Kingdom',
        dailyCategoryChannelId: 'daily-uk',
        liveCategoryChannelId: 'live-uk',
        enabled: true,
      },
    ],
  });
  const service = new SportsService(repository);

  const result = await service.listProfiles({ guildId: 'guild-1' });

  expect(result.isOk()).toBe(true);
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
```

```ts
// packages/core/tests/sports-live-event-service.test.ts
it('stores live tracked events per profile instead of only per guild', async () => {
  const service = new SportsLiveEventService(createRepositoryWithMockDb(mockDb));

  await service.upsertTrackedEvent({
    profileId: 'profile-uk',
    guildId: 'guild-1',
    sportName: 'Soccer',
    eventId: 'evt-1',
    eventName: 'Rangers vs Celtic',
    sportChannelId: 'sport-uk',
    eventChannelId: 'live-uk-1',
    status: 'live',
    kickoffAtUtc: new Date('2026-04-05T14:00:00.000Z'),
    lastScoreSnapshot: { scoreLabel: '1-0' },
    lastStateSnapshot: { statusLabel: 'Live' },
    lastSyncedAtUtc: new Date('2026-04-05T14:05:00.000Z'),
    finishedAtUtc: null,
    deleteAfterUtc: null,
    highlightsPosted: false,
  });

  expect(mockDb.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      profileId: 'profile-uk',
      guildId: 'guild-1',
      eventId: 'evt-1',
    }),
  );
});
```

- [ ] **Step 2: Run the targeted tests to verify the current single-profile model fails**

Run: `pnpm exec vitest run packages/core/tests/sports-service.test.ts packages/core/tests/sports-live-event-service.test.ts`

Expected: FAIL because the current schema and service types do not support profile-scoped sports records.

- [ ] **Step 3: Add the profile tables, profile IDs on bindings/live events, and the migration backfill**

```ts
// packages/core/src/infra/db/schema/tables.ts
export const sportsProfiles = mysqlTable(
  'sports_profiles',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    slug: varchar('slug', { length: 48 }).notNull(),
    label: varchar('label', { length: 80 }).notNull(),
    broadcastCountry: varchar('broadcast_country', { length: 120 }).notNull(),
    dailyCategoryChannelId: varchar('daily_category_channel_id', { length: 32 }),
    liveCategoryChannelId: varchar('live_category_channel_id', { length: 32 }),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    guildSlugUnique: uniqueIndex('sports_profiles_guild_slug_uq').on(table.guildId, table.slug),
    guildIdx: index('sports_profiles_guild_idx').on(table.guildId),
  }),
);
```

```ts
// packages/core/src/infra/db/schema/tables.ts
export const sportsChannelBindings = mysqlTable(
  'sports_channel_bindings',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    profileId: varchar('profile_id', { length: 26 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    sportId: varchar('sport_id', { length: 16 }),
    sportName: varchar('sport_name', { length: 80 }).notNull(),
    sportSlug: varchar('sport_slug', { length: 100 }).notNull(),
    channelId: varchar('channel_id', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    profileSportUnique: uniqueIndex('sports_channel_bindings_profile_sport_uq').on(table.profileId, table.sportName),
    guildChannelUnique: uniqueIndex('sports_channel_bindings_guild_channel_uq').on(table.guildId, table.channelId),
    profileIdx: index('sports_channel_bindings_profile_idx').on(table.profileId),
  }),
);
```

```sql
-- drizzle/migrations/0024_sports_multi_profiles.sql
ALTER TABLE `sports_guild_configs`
  CHANGE COLUMN `managed_category_channel_id` `managed_category_channel_id_legacy` varchar(32),
  CHANGE COLUMN `live_category_channel_id` `live_category_channel_id_legacy` varchar(32),
  CHANGE COLUMN `broadcast_country` `broadcast_country_legacy` varchar(120);

CREATE TABLE `sports_profiles` (
  `id` varchar(26) NOT NULL,
  `guild_id` varchar(32) NOT NULL,
  `slug` varchar(48) NOT NULL,
  `label` varchar(80) NOT NULL,
  `broadcast_country` varchar(120) NOT NULL,
  `daily_category_channel_id` varchar(32),
  `live_category_channel_id` varchar(32),
  `enabled` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `sports_profiles_pk` PRIMARY KEY (`id`),
  CONSTRAINT `sports_profiles_guild_slug_uq` UNIQUE (`guild_id`, `slug`)
);

ALTER TABLE `sports_channel_bindings`
  ADD COLUMN `profile_id` varchar(26) NULL;

ALTER TABLE `sports_live_event_channels`
  ADD COLUMN `profile_id` varchar(26) NULL;
```

- [ ] **Step 4: Run the targeted tests to verify the profile-aware schema passes**

Run: `pnpm exec vitest run packages/core/tests/sports-service.test.ts packages/core/tests/sports-live-event-service.test.ts`

Expected: PASS with the new profile-aware schema and service types.

- [ ] **Step 5: Commit**

```bash
git add drizzle/migrations/0024_sports_multi_profiles.sql drizzle/migrations/meta/0024_snapshot.json drizzle/migrations/meta/_journal.json packages/core/src/infra/db/schema/tables.ts packages/core/src/infra/db/schema/index.ts packages/core/tests/sports-service.test.ts packages/core/tests/sports-live-event-service.test.ts
git commit -m "feat: add sports multi-profile schema"
```

### Task 2: Add core profile services and repositories

**Files:**
- Modify: `packages/core/src/repositories/sports-repository.ts`
- Modify: `packages/core/src/services/sports-service.ts`
- Modify: `packages/core/src/services/sports-live-event-service.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/tests/sports-service.test.ts`
- Test: `packages/core/tests/sports-live-event-service.test.ts`

- [ ] **Step 1: Write the failing service tests for profile CRUD and profile-scoped reads**

```ts
// packages/core/tests/sports-service.test.ts
it('creates a sports profile and returns it from listProfiles', async () => {
  const service = new SportsService(createSportsRepository());

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

  const profiles = await service.listProfiles({ guildId: 'guild-1' });
  expect(profiles.value).toEqual([
    expect.objectContaining({
      slug: 'usa',
      broadcastCountry: 'United States',
    }),
  ]);
});
```

```ts
// packages/core/tests/sports-live-event-service.test.ts
it('lists tracked events filtered by profile', async () => {
  const service = new SportsLiveEventService(repository);

  const result = await service.listTrackedEvents({
    guildId: 'guild-1',
    profileId: 'profile-usa',
  });

  expect(result.isOk()).toBe(true);
  expect(repository.listTrackedEvents).toHaveBeenCalledWith(
    expect.objectContaining({
      guildId: 'guild-1',
      profileId: 'profile-usa',
    }),
  );
});
```

- [ ] **Step 2: Run the targeted tests to confirm the service API is missing**

Run: `pnpm exec vitest run packages/core/tests/sports-service.test.ts packages/core/tests/sports-live-event-service.test.ts`

Expected: FAIL because `SportsService` does not yet expose profile management methods and the live-event service does not yet filter by profile.

- [ ] **Step 3: Implement profile-aware repository and service methods**

```ts
// packages/core/src/services/sports-service.ts
public async listProfiles(input: { guildId: string }): Promise<Result<SportsProfileSummary[], AppError>> {
  return this.repository.listProfiles(input);
}

public async upsertProfile(input: {
  guildId: string;
  slug: string;
  label: string;
  broadcastCountry: string;
  dailyCategoryChannelId: string | null;
  liveCategoryChannelId: string | null;
  enabled: boolean;
  actorDiscordUserId: string | null;
}): Promise<Result<SportsProfileSummary, AppError>> {
  return this.repository.upsertProfile(input);
}
```

```ts
// packages/core/src/services/sports-live-event-service.ts
public async listTrackedEvents(input: {
  guildId: string;
  profileId?: string;
  statuses?: SportsLiveEventStatus[];
}): Promise<Result<SportsTrackedLiveEventSummary[], AppError>> {
  return this.repository.listTrackedEvents(input);
}
```

```ts
// packages/core/src/index.ts
export type {
  SportsGuildConfigSummary,
  SportsProfileSummary,
  SportsTrackedLiveEventSummary,
} from './services/sports-service.js';
```

- [ ] **Step 4: Run the targeted tests to verify the profile service layer passes**

Run: `pnpm exec vitest run packages/core/tests/sports-service.test.ts packages/core/tests/sports-live-event-service.test.ts`

Expected: PASS with the new repository and service methods.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/repositories/sports-repository.ts packages/core/src/services/sports-service.ts packages/core/src/services/sports-live-event-service.ts packages/core/src/index.ts packages/core/tests/sports-service.test.ts packages/core/tests/sports-live-event-service.test.ts
git commit -m "feat: add sports profile services"
```

### Task 3: Update the daily sports runtime and `/sports` management commands for profiles

**Files:**
- Modify: `apps/sports-worker/src/sports-runtime.ts`
- Modify: `apps/sports-worker/src/commands/sports.ts`
- Modify: `apps/sports-worker/src/commands/sports.test.ts`
- Modify: `apps/sports-worker/src/ui/sports-embeds.ts`
- Modify: `apps/sports-worker/src/ui/sports-embeds.test.ts`
- Test: `apps/sports-worker/src/sports-runtime.test.ts`
- Test: `apps/sports-worker/src/commands/sports.test.ts`

- [ ] **Step 1: Write the failing worker tests for multiple daily profiles**

```ts
// apps/sports-worker/src/sports-runtime.test.ts
it('publishes daily listings separately for uk and usa profiles', async () => {
  vi.spyOn(SportsService.prototype, 'listProfiles').mockResolvedValue(
    createOkResult([
      makeProfile({ profileId: 'profile-uk', slug: 'uk', broadcastCountry: 'United Kingdom', dailyCategoryChannelId: 'daily-uk' }),
      makeProfile({ profileId: 'profile-usa', slug: 'usa', broadcastCountry: 'United States', dailyCategoryChannelId: 'daily-usa' }),
    ]) as Awaited<ReturnType<SportsService['listProfiles']>>,
  );

  const result = await publishSportsForGuild({ guild, actorDiscordUserId: 'user-1' });

  expect(result.publishedProfileCount).toBe(2);
  expect(sendUkChannel).toHaveBeenCalled();
  expect(sendUsaChannel).toHaveBeenCalled();
});
```

```ts
// apps/sports-worker/src/commands/sports.test.ts
it('creates a sports profile through /sports profile-add', async () => {
  const interaction = createInteraction({
    subcommand: 'profile-add',
    options: {
      label: 'USA',
      broadcast_country: 'United States',
      daily_category_name: 'USA Daily Sport',
      live_category_name: 'USA Live Sport',
    },
  });

  await sportsCommand.execute(interaction);

  expect(SportsService.prototype.upsertProfile).toHaveBeenCalledWith(
    expect.objectContaining({
      slug: 'usa',
      broadcastCountry: 'United States',
    }),
  );
});
```

- [ ] **Step 2: Run the targeted tests to verify the current single-config commands/runtime fail**

Run: `pnpm exec vitest run apps/sports-worker/src/sports-runtime.test.ts apps/sports-worker/src/commands/sports.test.ts`

Expected: FAIL because the worker only publishes one guild-wide profile and `/sports` does not yet support `profile-add`, `profile-update`, `profile-remove`, or `profiles`.

- [ ] **Step 3: Implement profile-aware daily publishing and profile management commands**

```ts
// apps/sports-worker/src/commands/sports.ts
.addSubcommand((subcommand) =>
  subcommand
    .setName('profile-add')
    .setDescription('Add a sports profile for one broadcast country')
    .addStringOption((option) => option.setName('label').setDescription('Profile label').setRequired(true))
    .addStringOption((option) => option.setName('broadcast_country').setDescription('Broadcast country').setRequired(true))
    .addStringOption((option) => option.setName('daily_category_name').setDescription('Daily listings category').setRequired(true))
    .addStringOption((option) => option.setName('live_category_name').setDescription('Live events category').setRequired(true)),
)
```

```ts
// apps/sports-worker/src/sports-runtime.ts
for (const profile of profilesResult.value.filter((profile) => profile.enabled)) {
  const listingsResult = await sportsDataService.listDailyListingsForLocalDate({
    localDate,
    timezone: config.timezone,
    broadcastCountry: profile.broadcastCountry,
  });

  await publishProfileSportsForDate({
    guild: input.guild,
    config,
    profile,
    listingsBySport: toListingsMap(listingsResult.value),
  });
}
```

```ts
// apps/sports-worker/src/ui/sports-embeds.ts
export function buildSportHeaderMessage(input: {
  profileLabel: string;
  sportName: string;
  dateLabel: string;
  broadcastCountry: string;
  listingsCount: number;
}): string {
  return `**${input.profileLabel} - ${input.sportName}**\n${input.dateLabel}\n${input.broadcastCountry} televised events: ${input.listingsCount}`;
}
```

- [ ] **Step 4: Run the targeted tests to verify multi-profile daily publishing passes**

Run: `pnpm exec vitest run apps/sports-worker/src/sports-runtime.test.ts apps/sports-worker/src/commands/sports.test.ts apps/sports-worker/src/ui/sports-embeds.test.ts`

Expected: PASS with profile-scoped daily publishing and the new `/sports` profile management commands.

- [ ] **Step 5: Commit**

```bash
git add apps/sports-worker/src/sports-runtime.ts apps/sports-worker/src/commands/sports.ts apps/sports-worker/src/commands/sports.test.ts apps/sports-worker/src/ui/sports-embeds.ts apps/sports-worker/src/ui/sports-embeds.test.ts apps/sports-worker/src/sports-runtime.test.ts
git commit -m "feat: add profile-based sports publishing"
```

### Task 4: Fix live-event updates and move live channels to profile scope

**Files:**
- Modify: `packages/core/src/services/sports-data-service.ts`
- Modify: `apps/sports-worker/src/live-event-runtime.ts`
- Modify: `apps/sports-worker/src/live-event-runtime.test.ts`
- Modify: `apps/sports-worker/src/commands/live.ts`
- Modify: `apps/sports-worker/src/commands/live.test.ts`
- Modify: `apps/sports-worker/src/commands/lookup-command-support.ts`

- [ ] **Step 1: Write the failing tests for profile-scoped live updates and enrichment fallback**

```ts
// apps/sports-worker/src/live-event-runtime.test.ts
it('keeps updating a tracked live event when tv enrichment is unavailable', async () => {
  vi.spyOn(SportsDataService.prototype, 'listLiveEvents').mockResolvedValue(
    createOkResult([
      makeLiveEvent({
        eventId: 'evt-1',
        profileKey: 'uk',
        broadcasters: [],
        scoreLabel: '1-0',
        statusLabel: 'Live',
      }),
    ]) as Awaited<ReturnType<SportsDataService['listLiveEvents']>>,
  );

  const result = await reconcileLiveEventsForGuild({
    guild,
    timezone: 'Europe/London',
    now: new Date('2026-04-05T14:05:00.000Z'),
  });

  expect(result.updatedChannelCount).toBe(1);
  expect(existingLiveChannel.send).toHaveBeenCalled();
});
```

```ts
// apps/sports-worker/src/commands/live.test.ts
it('requires a profile or country selection when multiple profiles exist', async () => {
  vi.spyOn(SportsService.prototype, 'listProfiles').mockResolvedValue(
    createOkResult([
      makeProfile({ slug: 'uk', broadcastCountry: 'United Kingdom' }),
      makeProfile({ slug: 'usa', broadcastCountry: 'United States' }),
    ]) as Awaited<ReturnType<SportsService['listProfiles']>>,
  );

  await liveCommand.execute(interactionWithoutProfile);

  expect(interaction.editReply).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining('Select a sports profile or country'),
    }),
  );
});
```

- [ ] **Step 2: Run the targeted tests to verify the live runtime still depends on broadcaster enrichment**

Run: `pnpm exec vitest run apps/sports-worker/src/live-event-runtime.test.ts apps/sports-worker/src/commands/live.test.ts`

Expected: FAIL because the current runtime drops live events with empty broadcaster lists and live lookups still only read one guild-wide country.

- [ ] **Step 3: Implement profile-matched live tracking and fallback-safe live event discovery**

```ts
// packages/core/src/services/sports-data-service.ts
type SportsLiveEvent = {
  eventId: string;
  eventName: string;
  sportName: string | null;
  statusLabel: string;
  scoreLabel: string | null;
  startTimeUkLabel: string | null;
  imageUrl: string | null;
  broadcasters: SportsBroadcastChannel[];
  matchedBroadcastCountries: string[];
};
```

```ts
// apps/sports-worker/src/live-event-runtime.ts
const matchedProfiles = profiles.filter((profile) =>
  event.matchedBroadcastCountries.includes(profile.broadcastCountry),
);

for (const profile of matchedProfiles) {
  if (!profile.liveCategoryChannelId) {
    continue;
  }

  await reconcileLiveEventForProfile({
    guild: input.guild,
    config,
    profile,
    event,
    now,
  });
}
```

```ts
// apps/sports-worker/src/commands/lookup-command-support.ts
export async function resolveSportsProfileSelection(input: {
  guildId: string;
  profileSlug: string | null;
  broadcastCountry: string | null;
}): Promise<Result<SportsProfileSummary, AppError>> {
  const profilesResult = await sportsService.listProfiles({ guildId: input.guildId });
  if (profilesResult.isErr()) {
    return err(profilesResult.error);
  }

  const enabledProfiles = profilesResult.value.filter((profile) => profile.enabled);
  if (enabledProfiles.length === 1 && !input.profileSlug && !input.broadcastCountry) {
    return ok(enabledProfiles[0]);
  }

  return err(new AppError('SPORTS_PROFILE_REQUIRED', 'Select a sports profile or country for this command.', 400));
}
```

- [ ] **Step 4: Run the targeted tests to verify live channels update while the event is live**

Run: `pnpm exec vitest run apps/sports-worker/src/live-event-runtime.test.ts apps/sports-worker/src/commands/live.test.ts`

Expected: PASS with profile-scoped live tracking and resilience when broadcaster enrichment is missing or delayed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/services/sports-data-service.ts apps/sports-worker/src/live-event-runtime.ts apps/sports-worker/src/live-event-runtime.test.ts apps/sports-worker/src/commands/live.ts apps/sports-worker/src/commands/live.test.ts apps/sports-worker/src/commands/lookup-command-support.ts
git commit -m "fix: track live sports events per profile"
```

### Task 5: Make lookup commands profile-aware, update docs, and run the full verification/deploy flow

**Files:**
- Modify: `apps/sports-worker/src/commands/search.ts`
- Modify: `apps/sports-worker/src/commands/match.ts`
- Modify: `apps/sports-worker/src/commands/fixtures.ts`
- Modify: `apps/sports-worker/src/commands/results.ts`
- Modify: `apps/sports-worker/src/commands/standings.ts`
- Modify: `apps/sports-worker/src/commands/team.ts`
- Modify: `apps/sports-worker/src/commands/player.ts`
- Modify: `apps/sports-worker/src/commands/highlights.ts`
- Modify: matching `*.test.ts` files under `apps/sports-worker/src/commands/`
- Modify: `README.md`
- Modify: `SETUP_GUIDE.md`

- [ ] **Step 1: Write the failing command tests for explicit profile selection**

```ts
// apps/sports-worker/src/commands/search.test.ts
it('uses the selected sports profile country for search', async () => {
  vi.spyOn(SportsService.prototype, 'listProfiles').mockResolvedValue(
    createOkResult([
      makeProfile({ slug: 'usa', broadcastCountry: 'United States' }),
    ]) as Awaited<ReturnType<SportsService['listProfiles']>>,
  );

  await searchCommand.execute(createInteraction({
    query: 'Lakers',
    profile: 'usa',
  }));

  expect(SportsDataService.prototype.searchEvents).toHaveBeenCalledWith(
    expect.objectContaining({
      broadcastCountry: 'United States',
    }),
  );
});
```

- [ ] **Step 2: Run the targeted command tests to verify the old single-country fallback fails**

Run: `pnpm exec vitest run apps/sports-worker/src/commands/search.test.ts apps/sports-worker/src/commands/match.test.ts apps/sports-worker/src/commands/fixtures.test.ts apps/sports-worker/src/commands/results.test.ts apps/sports-worker/src/commands/standings.test.ts apps/sports-worker/src/commands/team.test.ts apps/sports-worker/src/commands/player.test.ts apps/sports-worker/src/commands/highlights.test.ts`

Expected: FAIL because the commands still resolve country from one guild-wide sports config.

- [ ] **Step 3: Update all lookup commands and docs for profile-aware behavior**

```ts
// apps/sports-worker/src/commands/search.ts
const profileResult = await resolveSportsProfileSelection({
  guildId: interaction.guildId!,
  profileSlug: interaction.options.getString('profile'),
  broadcastCountry: interaction.options.getString('broadcast_country'),
});

if (profileResult.isErr()) {
  await sendReply(interaction, profileResult.error.message);
  return;
}

const searchResult = await sportsDataService.searchEvents({
  query,
  timezone: config?.timezone ?? 'Europe/London',
  broadcastCountry: profileResult.value.broadcastCountry,
});
```

```md
<!-- README.md -->
### Sports Profiles

Use `/sports profile-add` to create one country-specific setup per region, such as:

- `UK Daily Sport` + `UK Live Sport` for `United Kingdom`
- `USA Daily Sport` + `USA Live Sport` for `United States`

All enabled profiles publish at the shared guild schedule time of `00:01`.
```

- [ ] **Step 4: Run the full gate**

Run:

```bash
pnpm lint --fix
pnpm typecheck
pnpm test --coverage
pnpm build
```

Expected: all commands succeed with no warnings and coverage remains at or above `95%`.

- [ ] **Step 5: Commit, push, deploy, and smoke test**

Run:

```bash
git add apps/sports-worker/src/commands/search.ts apps/sports-worker/src/commands/search.test.ts apps/sports-worker/src/commands/match.ts apps/sports-worker/src/commands/match.test.ts apps/sports-worker/src/commands/fixtures.ts apps/sports-worker/src/commands/fixtures.test.ts apps/sports-worker/src/commands/results.ts apps/sports-worker/src/commands/results.test.ts apps/sports-worker/src/commands/standings.ts apps/sports-worker/src/commands/standings.test.ts apps/sports-worker/src/commands/team.ts apps/sports-worker/src/commands/team.test.ts apps/sports-worker/src/commands/player.ts apps/sports-worker/src/commands/player.test.ts apps/sports-worker/src/commands/highlights.ts apps/sports-worker/src/commands/highlights.test.ts README.md SETUP_GUIDE.md
git commit -m "feat: add multi-profile sports command support"
git push origin main
```

Then update the droplet:

```bash
C:\Users\0\Desktop\store\dev\JSTS\Discord\Discord-Ticket-to-Sale-SaaS\.codex-tools\plink.exe -ssh root@139.59.188.119 -P 22 "<use the approved local-only SSH authentication and host key from AGENTS.md>" ". ~/.nvm/nvm.sh && nvm use 24.13.1 >/dev/null && cd /var/www/voodoo && git fetch origin && git checkout main && git pull --ff-only origin main && pnpm install && pnpm build && pnpm migrate && pnpm deploy:commands && /root/.nvm/versions/node/v24.13.1/bin/pm2 start ecosystem.config.cjs --update-env && /root/.nvm/versions/node/v24.13.1/bin/pm2 save"
```

Smoke test:

```bash
C:\Users\0\Desktop\store\dev\JSTS\Discord\Discord-Ticket-to-Sale-SaaS\.codex-tools\plink.exe -ssh root@139.59.188.119 -P 22 "<use the approved local-only SSH authentication and host key from AGENTS.md>" ". ~/.nvm/nvm.sh && nvm use 24.13.1 >/dev/null && cd /var/www/voodoo && git rev-parse HEAD && /root/.nvm/versions/node/v24.13.1/bin/pm2 list && /root/.nvm/versions/node/v24.13.1/bin/pm2 logs voodoo-sports --lines 50 --nostream"
```

Expected: droplet `main` matches the pushed commit, PM2 apps stay online, and the sports worker logs show healthy multi-profile publishing and live-event sync.
