import { and, eq, lte } from 'drizzle-orm';
import { ulid } from 'ulid';

import { getDb } from '../infra/db/client.js';
import { sportsChannelBindings, sportsGuildConfigs } from '../infra/db/schema/index.js';
import { normalizeBroadcastCountries } from '../services/sports-broadcast-countries.js';

export type SportsGuildConfigRecord = {
  id: string;
  guildId: string;
  enabled: boolean;
  managedCategoryChannelId: string | null;
  liveCategoryChannelId?: string | null;
  localTimeHhmm: string;
  timezone: string;
  broadcastCountry: string;
  broadcastCountries: string[];
  nextRunAtUtc: Date;
  lastRunAtUtc: Date | null;
  lastLocalRunDate: string | null;
  updatedByDiscordUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SportsChannelBindingRecord = {
  id: string;
  guildId: string;
  sportId: string | null;
  sportName: string;
  sportSlug: string;
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type SportsProfileRecord = {
  profileId: string;
  guildId: string;
  slug: string;
  label: string;
  broadcastCountry: string;
  dailyCategoryChannelId: string | null;
  liveCategoryChannelId: string | null;
  enabled: boolean;
};

function slugifyProfileLabel(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'default';
}

function mapGuildConfigRow(
  row: typeof sportsGuildConfigs.$inferSelect,
): SportsGuildConfigRecord {
  const broadcastCountries = normalizeBroadcastCountries(row.broadcastCountries ?? [row.broadcastCountry]);

  return {
    id: row.id,
    guildId: row.guildId,
    enabled: row.enabled,
    managedCategoryChannelId: row.managedCategoryChannelId ?? null,
    liveCategoryChannelId: row.liveCategoryChannelId ?? null,
    localTimeHhmm: row.localTimeHhmm,
    timezone: row.timezone,
    broadcastCountry: broadcastCountries[0] ?? row.broadcastCountry,
    broadcastCountries,
    nextRunAtUtc: row.nextRunAtUtc,
    lastRunAtUtc: row.lastRunAtUtc ?? null,
    lastLocalRunDate: row.lastLocalRunDate ?? null,
    updatedByDiscordUserId: row.updatedByDiscordUserId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapChannelBindingRow(
  row: typeof sportsChannelBindings.$inferSelect,
): SportsChannelBindingRecord {
  return {
    id: row.id,
    guildId: row.guildId,
    sportId: row.sportId ?? null,
    sportName: row.sportName,
    sportSlug: row.sportSlug,
    channelId: row.channelId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapProfileRecord(config: SportsGuildConfigRecord): SportsProfileRecord {
  return {
    profileId: config.id,
    guildId: config.guildId,
    slug: slugifyProfileLabel(config.broadcastCountry),
    label: config.broadcastCountry,
    broadcastCountry: config.broadcastCountry,
    dailyCategoryChannelId: config.managedCategoryChannelId,
    liveCategoryChannelId: config.liveCategoryChannelId ?? null,
    enabled: config.enabled,
  };
}

export class SportsRepository {
  private readonly db = getDb();

  private getAffectedRowCount(result: unknown): number {
    if (typeof result === 'object' && result !== null) {
      if ('affectedRows' in result && typeof result.affectedRows === 'number') {
        return result.affectedRows;
      }
      if ('rowsAffected' in result && typeof result.rowsAffected === 'number') {
        return result.rowsAffected;
      }
    }

    if (Array.isArray(result) && result.length > 0) {
      return this.getAffectedRowCount(result[0]);
    }

    return 0;
  }

  public async getGuildConfig(guildId: string): Promise<SportsGuildConfigRecord | null> {
    const row = await this.db.query.sportsGuildConfigs.findFirst({
      where: eq(sportsGuildConfigs.guildId, guildId),
    });

    return row ? mapGuildConfigRow(row) : null;
  }

  public async listProfiles(input: { guildId: string }): Promise<SportsProfileRecord[]> {
    const config = await this.getGuildConfig(input.guildId);
    return config ? [mapProfileRecord(config)] : [];
  }

  public async upsertGuildConfig(input: {
    guildId: string;
    managedCategoryChannelId: string | null;
    liveCategoryChannelId: string | null;
    localTimeHhmm: string;
    timezone: string;
    broadcastCountries: string[];
    nextRunAtUtc: Date;
    updatedByDiscordUserId: string;
  }): Promise<SportsGuildConfigRecord> {
    const existing = await this.getGuildConfig(input.guildId);
    const now = new Date();
    const broadcastCountries = normalizeBroadcastCountries(input.broadcastCountries);
    const legacyBroadcastCountry = broadcastCountries[0] ?? 'United Kingdom';

    if (existing) {
      await this.db
        .update(sportsGuildConfigs)
        .set({
          enabled: true,
          managedCategoryChannelId: input.managedCategoryChannelId,
          liveCategoryChannelId: input.liveCategoryChannelId,
          localTimeHhmm: input.localTimeHhmm,
          timezone: input.timezone,
          broadcastCountry: legacyBroadcastCountry,
          broadcastCountries,
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
        managedCategoryChannelId: input.managedCategoryChannelId,
        liveCategoryChannelId: input.liveCategoryChannelId,
        localTimeHhmm: input.localTimeHhmm,
        timezone: input.timezone,
        broadcastCountry: legacyBroadcastCountry,
        broadcastCountries,
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

  public async listChannelBindings(guildId: string): Promise<SportsChannelBindingRecord[]> {
    const rows = await this.db.query.sportsChannelBindings.findMany({
      where: eq(sportsChannelBindings.guildId, guildId),
      orderBy: (table, { asc }) => [asc(table.sportName), asc(table.createdAt), asc(table.id)],
    });

    return rows.map(mapChannelBindingRow);
  }

  public async getChannelBindingBySport(input: {
    guildId: string;
    sportName: string;
  }): Promise<SportsChannelBindingRecord | null> {
    const row = await this.db.query.sportsChannelBindings.findFirst({
      where: and(
        eq(sportsChannelBindings.guildId, input.guildId),
        eq(sportsChannelBindings.sportName, input.sportName),
      ),
      orderBy: (table, { asc }) => [asc(table.createdAt), asc(table.id)],
    });

    return row ? mapChannelBindingRow(row) : null;
  }

  public async upsertChannelBinding(input: {
    guildId: string;
    sportId: string | null;
    sportName: string;
    sportSlug: string;
    channelId: string;
  }): Promise<SportsChannelBindingRecord> {
    const existing = await this.getChannelBindingBySport({
      guildId: input.guildId,
      sportName: input.sportName,
    });
    const now = new Date();

    if (existing) {
      await this.db
        .update(sportsChannelBindings)
        .set({
          sportId: input.sportId,
          sportSlug: input.sportSlug,
          channelId: input.channelId,
          updatedAt: now,
        })
        .where(eq(sportsChannelBindings.id, existing.id));
    } else {
      await this.db.insert(sportsChannelBindings).values({
        id: ulid(),
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
    });
    if (!record) {
      throw new Error('Failed to upsert sports channel binding');
    }

    return record;
  }

  public async deleteChannelBinding(bindingId: string): Promise<boolean> {
    const result = await this.db.delete(sportsChannelBindings).where(eq(sportsChannelBindings.id, bindingId));
    return this.getAffectedRowCount(result) > 0;
  }
}
