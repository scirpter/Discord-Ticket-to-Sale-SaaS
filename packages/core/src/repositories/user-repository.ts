import { and, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { getDb } from '../infra/db/client.js';
import { superAdmins, tenantMembers, users } from '../infra/db/schema/index.js';

export type UserRecord = {
  id: string;
  discordUserId: string;
  username: string;
  avatarUrl: string | null;
};

export class UserRepository {
  private readonly db = getDb();

  public async upsertDiscordUser(input: {
    discordUserId: string;
    username: string;
    avatarUrl: string | null;
  }): Promise<UserRecord> {
    const existing = await this.db.query.users.findFirst({
      where: eq(users.discordUserId, input.discordUserId),
    });

    if (existing) {
      await this.db
        .update(users)
        .set({
          username: input.username,
          avatarUrl: input.avatarUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id));

      return {
        id: existing.id,
        discordUserId: existing.discordUserId,
        username: input.username,
        avatarUrl: input.avatarUrl,
      };
    }

    const created: UserRecord = {
      id: ulid(),
      discordUserId: input.discordUserId,
      username: input.username,
      avatarUrl: input.avatarUrl,
    };

    await this.db.insert(users).values(created);
    return created;
  }

  public async ensureSuperAdmin(input: { userId: string; discordUserId: string }): Promise<void> {
    const existing = await this.db.query.superAdmins.findFirst({
      where: eq(superAdmins.discordUserId, input.discordUserId),
    });

    if (existing) {
      return;
    }

    await this.db.insert(superAdmins).values({
      id: ulid(),
      userId: input.userId,
      discordUserId: input.discordUserId,
    });
  }

  public async isSuperAdmin(discordUserId: string): Promise<boolean> {
    const existing = await this.db.query.superAdmins.findFirst({
      where: eq(superAdmins.discordUserId, discordUserId),
    });

    return Boolean(existing);
  }

  public async getByDiscordUserId(discordUserId: string): Promise<UserRecord | null> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.discordUserId, discordUserId),
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      discordUserId: user.discordUserId,
      username: user.username,
      avatarUrl: user.avatarUrl,
    };
  }

  public async listUsers(): Promise<UserRecord[]> {
    const rows = await this.db.query.users.findMany({
      orderBy: [desc(users.createdAt)],
    });

    return rows.map((row) => ({
      id: row.id,
      discordUserId: row.discordUserId,
      username: row.username,
      avatarUrl: row.avatarUrl,
    }));
  }

  public async getTenantIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.db.query.tenantMembers.findMany({
      where: eq(tenantMembers.userId, userId),
    });

    return rows.map((row) => row.tenantId);
  }

  public async getMemberRole(input: {
    tenantId: string;
    userId: string;
  }): Promise<'owner' | 'admin' | 'member' | null> {
    const membership = await this.db.query.tenantMembers.findFirst({
      where: and(eq(tenantMembers.tenantId, input.tenantId), eq(tenantMembers.userId, input.userId)),
    });

    return membership?.role ?? null;
  }
}
