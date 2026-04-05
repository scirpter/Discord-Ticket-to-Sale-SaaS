import { and, eq, lte } from 'drizzle-orm';
import { ulid } from 'ulid';

import { getDb } from '../infra/db/client.js';
import {
  sportsChannelBindings,
  sportsGuildConfigs,
  sportsLiveEventChannels,
  sportsProfiles,
} from '../infra/db/schema/index.js';

export type SportsGuildConfigRecord = {
  id: string;
  guildId: string;
  enabled: boolean;
  managedCategoryChannelId: string | null;
  liveCategoryChannelId?: string | null;
  localTimeHhmm: string;
  timezone: string;
  broadcastCountry: string;
  nextRunAtUtc: Date;
  lastRunAtUtc: Date | null;
  lastLocalRunDate: string | null;
  updatedByDiscordUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SportsProfileRecord = {
  id: string;
  guildId: string;
  slug: string;
  label: string;
  broadcastCountry: string;
  dailyCategoryChannelId: string | null;
  liveCategoryChannelId: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type SportsChannelBindingRecord = {
  id: string;
  profileId: string;
  guildId: string;
  sportId: string | null;
  sportName: string;
  sportSlug: string;
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
};

function mapGuildConfigRow(
  row: typeof sportsGuildConfigs.$inferSelect,
): SportsGuildConfigRecord {
  return {
    id: row.id,
    guildId: row.guildId,
    enabled: row.enabled,
    managedCategoryChannelId: row.managedCategoryChannelIdLegacy ?? null,
    liveCategoryChannelId: row.liveCategoryChannelIdLegacy ?? null,
    localTimeHhmm: row.localTimeHhmm,
    timezone: row.timezone,
    broadcastCountry: row.broadcastCountryLegacy,
    nextRunAtUtc: row.nextRunAtUtc,
    lastRunAtUtc: row.lastRunAtUtc ?? null,
    lastLocalRunDate: row.lastLocalRunDate ?? null,
    updatedByDiscordUserId: row.updatedByDiscordUserId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapProfileRow(row: typeof sportsProfiles.$inferSelect): SportsProfileRecord {
  return {
    id: row.id,
    guildId: row.guildId,
    slug: row.slug,
    label: row.label,
    broadcastCountry: row.broadcastCountry,
    dailyCategoryChannelId: row.dailyCategoryChannelId ?? null,
    liveCategoryChannelId: row.liveCategoryChannelId ?? null,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapChannelBindingRow(
  row: typeof sportsChannelBindings.$inferSelect,
): SportsChannelBindingRecord {
  return {
    id: row.id,
    profileId: row.profileId,
    guildId: row.guildId,
    sportId: row.sportId ?? null,
    sportName: row.sportName,
    sportSlug: row.sportSlug,
    channelId: row.channelId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SportsRepository {
  private readonly db = getDb();

  private async getDefaultProfileId(guildId: string): Promise<string | null> {
    const row = await this.db.query.sportsProfiles?.findFirst({
      where: and(eq(sportsProfiles.guildId, guildId), eq(sportsProfiles.slug, 'default')),
    });

    return row?.id ?? null;
  }

  private async getProfileBySlug(input: {
    guildId: string;
    slug: string;
  }): Promise<SportsProfileRecord | null> {
    const row = await this.db.query.sportsProfiles.findFirst({
      where: and(eq(sportsProfiles.guildId, input.guildId), eq(sportsProfiles.slug, input.slug)),
    });

    return row ? mapProfileRow(row) : null;
  }

  public async getGuildConfig(guildId: string): Promise<SportsGuildConfigRecord | null> {
    const row = await this.db.query.sportsGuildConfigs.findFirst({
      where: eq(sportsGuildConfigs.guildId, guildId),
    });

    return row ? mapGuildConfigRow(row) : null;
  }

  public async listProfiles(guildId: string): Promise<SportsProfileRecord[]> {
    const rows = await this.db.query.sportsProfiles.findMany({
      where: eq(sportsProfiles.guildId, guildId),
      orderBy: (table, { asc }) => [asc(table.slug)],
    });

    return rows.map(mapProfileRow);
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
  }): Promise<SportsProfileRecord> {
    const existing = await this.getProfileBySlug({
      guildId: input.guildId,
      slug: input.slug,
    });
    const now = new Date();

    if (existing) {
      await this.db
        .update(sportsProfiles)
        .set({
          label: input.label,
          broadcastCountry: input.broadcastCountry,
          dailyCategoryChannelId: input.dailyCategoryChannelId,
          liveCategoryChannelId: input.liveCategoryChannelId,
          enabled: input.enabled,
          updatedAt: now,
        })
        .where(eq(sportsProfiles.id, existing.id));
    } else {
      await this.db.insert(sportsProfiles).values({
        id: ulid(),
        guildId: input.guildId,
        slug: input.slug,
        label: input.label,
        broadcastCountry: input.broadcastCountry,
        dailyCategoryChannelId: input.dailyCategoryChannelId,
        liveCategoryChannelId: input.liveCategoryChannelId,
        enabled: input.enabled,
        createdAt: now,
        updatedAt: now,
      });
    }

    const profile = await this.getProfileBySlug({
      guildId: input.guildId,
      slug: input.slug,
    });
    if (!profile) {
      throw new Error('Failed to upsert sports profile');
    }

    return profile;
  }

  public async deleteProfile(input: {
    guildId: string;
    profileId: string;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(sportsLiveEventChannels)
        .where(
          and(
            eq(sportsLiveEventChannels.guildId, input.guildId),
            eq(sportsLiveEventChannels.profileId, input.profileId),
          ),
        );

      await tx
        .delete(sportsChannelBindings)
        .where(
          and(
            eq(sportsChannelBindings.guildId, input.guildId),
            eq(sportsChannelBindings.profileId, input.profileId),
          ),
        );

      await tx
        .delete(sportsProfiles)
        .where(and(eq(sportsProfiles.guildId, input.guildId), eq(sportsProfiles.id, input.profileId)));
    });
  }

  public async upsertGuildConfig(input: {
    guildId: string;
    managedCategoryChannelId: string | null;
    liveCategoryChannelId: string | null;
    localTimeHhmm: string;
    timezone: string;
    broadcastCountry: string;
    nextRunAtUtc: Date;
    updatedByDiscordUserId: string;
  }): Promise<SportsGuildConfigRecord> {
    const existing = await this.getGuildConfig(input.guildId);
    const now = new Date();

    if (existing) {
      await this.db
        .update(sportsGuildConfigs)
        .set({
          enabled: true,
          managedCategoryChannelIdLegacy: input.managedCategoryChannelId,
          liveCategoryChannelIdLegacy: input.liveCategoryChannelId,
          localTimeHhmm: input.localTimeHhmm,
          timezone: input.timezone,
          broadcastCountryLegacy: input.broadcastCountry,
          nextRunAtUtc: input.nextRunAtUtc,
          updatedByDiscordUserId: input.updatedByDiscordUserId,
          updatedAt: now,
        })
        .where(eq(sportsGuildConfigs.id, existing.id));
    } else {
      await this.db.insert(sportsGuildConfigs).values({
        id: ulid(),
        guildId: input.guildId,
        enabled: true,
        managedCategoryChannelIdLegacy: input.managedCategoryChannelId,
        liveCategoryChannelIdLegacy: input.liveCategoryChannelId,
        localTimeHhmm: input.localTimeHhmm,
        timezone: input.timezone,
        broadcastCountryLegacy: input.broadcastCountry,
        nextRunAtUtc: input.nextRunAtUtc,
        updatedByDiscordUserId: input.updatedByDiscordUserId,
        createdAt: now,
        updatedAt: now,
      });
    }

    const record = await this.getGuildConfig(input.guildId);
    if (!record) {
      throw new Error('Failed to upsert sports guild config');
    }

    return record;
  }

  public async listDueGuildConfigs(input: {
    now: Date;
    limit: number;
  }): Promise<SportsGuildConfigRecord[]> {
    const rows = await this.db.query.sportsGuildConfigs.findMany({
      where: and(
        eq(sportsGuildConfigs.enabled, true),
        lte(sportsGuildConfigs.nextRunAtUtc, input.now),
      ),
      orderBy: (table, { asc }) => [asc(table.nextRunAtUtc)],
      limit: input.limit,
    });

    return rows.map(mapGuildConfigRow);
  }

  public async setNextRunAt(input: {
    guildId: string;
    nextRunAtUtc: Date;
    updatedByDiscordUserId: string | null;
    lastRunAtUtc?: Date | null;
    lastLocalRunDate?: string | null;
  }): Promise<void> {
    await this.db
      .update(sportsGuildConfigs)
      .set({
        nextRunAtUtc: input.nextRunAtUtc,
        updatedByDiscordUserId: input.updatedByDiscordUserId,
        lastRunAtUtc: input.lastRunAtUtc ?? undefined,
        lastLocalRunDate: input.lastLocalRunDate ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(sportsGuildConfigs.guildId, input.guildId));
  }

  public async listChannelBindings(input: {
    guildId: string;
    profileId?: string | null;
  }): Promise<SportsChannelBindingRecord[]> {
    const profileId = input.profileId ? await this.resolveProfileId(input) : null;
    const rows = await this.db.query.sportsChannelBindings.findMany({
      where: profileId
        ? and(
            eq(sportsChannelBindings.profileId, profileId),
            eq(sportsChannelBindings.guildId, input.guildId),
          )
        : eq(sportsChannelBindings.guildId, input.guildId),
      orderBy: (table, { asc }) => [asc(table.sportName)],
    });

    return rows.map(mapChannelBindingRow);
  }

  public async getChannelBindingBySport(input: {
    guildId: string;
    sportName: string;
    profileId?: string | null;
  }): Promise<SportsChannelBindingRecord | null> {
    const profileId = await this.resolveProfileId(input);
    const row = await this.db.query.sportsChannelBindings.findFirst({
      where: and(
        eq(sportsChannelBindings.profileId, profileId),
        eq(sportsChannelBindings.guildId, input.guildId),
        eq(sportsChannelBindings.sportName, input.sportName),
      ),
    });

    return row ? mapChannelBindingRow(row) : null;
  }

  public async upsertChannelBinding(input: {
    guildId: string;
    profileId?: string | null;
    sportId: string | null;
    sportName: string;
    sportSlug: string;
    channelId: string;
  }): Promise<SportsChannelBindingRecord> {
    const profileId = await this.resolveProfileId(input);
    const existing = await this.getChannelBindingBySport({
      guildId: input.guildId,
      sportName: input.sportName,
      profileId,
    });
    const now = new Date();

    if (existing) {
      await this.db
        .update(sportsChannelBindings)
        .set({
          profileId,
          sportId: input.sportId,
          sportSlug: input.sportSlug,
          channelId: input.channelId,
          updatedAt: now,
        })
        .where(eq(sportsChannelBindings.id, existing.id));
    } else {
      await this.db.insert(sportsChannelBindings).values({
        id: ulid(),
        profileId,
        guildId: input.guildId,
        sportId: input.sportId,
        sportName: input.sportName,
        sportSlug: input.sportSlug,
        channelId: input.channelId,
        createdAt: now,
        updatedAt: now,
      });
    }

    const record = await this.getChannelBindingBySport({
      guildId: input.guildId,
      sportName: input.sportName,
      profileId,
    });
    if (!record) {
      throw new Error('Failed to upsert sports channel binding');
    }

    return record;
  }

  private async resolveProfileId(input: {
    guildId: string;
    profileId?: string | null;
  }): Promise<string> {
    return input.profileId ?? (await this.getDefaultProfileId(input.guildId)) ?? input.guildId;
  }
}
