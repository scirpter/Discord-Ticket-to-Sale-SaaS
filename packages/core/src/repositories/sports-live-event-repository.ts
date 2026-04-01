import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { getDb } from '../infra/db/client.js';
import { sportsLiveEventChannels } from '../infra/db/schema/index.js';

export type SportsLiveEventChannelRecord = {
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

function mapSportsLiveEventChannelRow(
  row: typeof sportsLiveEventChannels.$inferSelect,
): SportsLiveEventChannelRecord {
  return {
    id: row.id,
    guildId: row.guildId,
    sportName: row.sportName,
    eventId: row.eventId,
    eventName: row.eventName,
    sportChannelId: row.sportChannelId,
    eventChannelId: row.eventChannelId ?? null,
    status: row.status,
    kickoffAtUtc: row.kickoffAtUtc,
    lastScoreSnapshot: row.lastScoreSnapshot ?? null,
    lastStateSnapshot: row.lastStateSnapshot ?? null,
    lastSyncedAtUtc: row.lastSyncedAtUtc ?? null,
    finishedAtUtc: row.finishedAtUtc ?? null,
    deleteAfterUtc: row.deleteAfterUtc ?? null,
    highlightsPosted: row.highlightsPosted,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SportsLiveEventRepository {
  private readonly db = getDb();

  private async getByGuildAndEvent(input: {
    guildId: string;
    eventId: string;
  }): Promise<SportsLiveEventChannelRecord | null> {
    const row = await this.db.query.sportsLiveEventChannels.findFirst({
      where: and(
        eq(sportsLiveEventChannels.guildId, input.guildId),
        eq(sportsLiveEventChannels.eventId, input.eventId),
      ),
    });

    return row ? mapSportsLiveEventChannelRow(row) : null;
  }

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

      const refreshed = await this.getByGuildAndEvent({
        guildId: input.guildId,
        eventId: input.eventId,
      });
      if (!refreshed) {
        throw new Error('Failed to upsert sports live event channel');
      }

      return refreshed;
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

    const created = await this.getByGuildAndEvent({
      guildId: input.guildId,
      eventId: input.eventId,
    });
    if (!created) {
      throw new Error('Failed to upsert sports live event channel');
    }

    return created;
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
