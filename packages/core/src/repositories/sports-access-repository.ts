import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { getDb } from '../infra/db/client.js';
import { sportsAuthorizedUsers } from '../infra/db/schema/index.js';

export type SportsAuthorizedUserRecord = {
  id: string;
  guildId: string;
  discordUserId: string;
  grantedByDiscordUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapAuthorizedUserRow(
  row: typeof sportsAuthorizedUsers.$inferSelect,
): SportsAuthorizedUserRecord {
  return {
    id: row.id,
    guildId: row.guildId,
    discordUserId: row.discordUserId,
    grantedByDiscordUserId: row.grantedByDiscordUserId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SportsAccessRepository {
  private readonly db = getDb();

  private async getAuthorizedUserByDiscordId(input: {
    guildId: string;
    discordUserId: string;
  }): Promise<SportsAuthorizedUserRecord | null> {
    const row = await this.db.query.sportsAuthorizedUsers.findFirst({
      where: and(
        eq(sportsAuthorizedUsers.guildId, input.guildId),
        eq(sportsAuthorizedUsers.discordUserId, input.discordUserId),
      ),
      orderBy: (table, { desc }) => [desc(table.updatedAt), desc(table.createdAt)],
    });

    return row ? mapAuthorizedUserRow(row) : null;
  }

  public async listAuthorizedUsers(input: {
    guildId: string;
  }): Promise<SportsAuthorizedUserRecord[]> {
    const rows = await this.db.query.sportsAuthorizedUsers.findMany({
      where: eq(sportsAuthorizedUsers.guildId, input.guildId),
      orderBy: (table, { desc }) => [desc(table.updatedAt), desc(table.createdAt)],
    });

    const dedupedByDiscordUserId = new Map<string, SportsAuthorizedUserRecord>();
    for (const row of rows) {
      const mapped = mapAuthorizedUserRow(row);
      if (!dedupedByDiscordUserId.has(mapped.discordUserId)) {
        dedupedByDiscordUserId.set(mapped.discordUserId, mapped);
      }
    }

    return [...dedupedByDiscordUserId.values()].sort((left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime(),
    );
  }

  public async upsertAuthorizedUser(input: {
    guildId: string;
    discordUserId: string;
    grantedByDiscordUserId: string;
  }): Promise<{ created: boolean; record: SportsAuthorizedUserRecord }> {
    const existing = await this.getAuthorizedUserByDiscordId({
      guildId: input.guildId,
      discordUserId: input.discordUserId,
    });
    const now = new Date();

    if (existing) {
      await this.db
        .update(sportsAuthorizedUsers)
        .set({
          guildId: input.guildId,
          grantedByDiscordUserId: input.grantedByDiscordUserId,
          updatedAt: now,
        })
        .where(eq(sportsAuthorizedUsers.id, existing.id));
    } else {
      await this.db.insert(sportsAuthorizedUsers).values({
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
      throw new Error('Failed to upsert sports authorized user');
    }

    return {
      created: !existing,
      record,
    };
  }

  public async revokeAuthorizedUser(input: {
    guildId: string;
    discordUserId: string;
  }): Promise<boolean> {
    const existing = await this.getAuthorizedUserByDiscordId({
      guildId: input.guildId,
      discordUserId: input.discordUserId,
    });
    if (!existing) {
      return false;
    }

    await this.db
      .delete(sportsAuthorizedUsers)
      .where(
        and(
          eq(sportsAuthorizedUsers.guildId, input.guildId),
          eq(sportsAuthorizedUsers.discordUserId, input.discordUserId),
        ),
      );

    return true;
  }
}
