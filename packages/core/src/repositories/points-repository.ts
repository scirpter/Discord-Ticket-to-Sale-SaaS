import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm';
import { ulid } from 'ulid';

import { getDb } from '../infra/db/client.js';
import { customerPointsAccounts, customerPointsLedger } from '../infra/db/schema/index.js';

export type PointsAccountRecord = {
  id: string;
  tenantId: string;
  guildId: string;
  emailNormalized: string;
  emailDisplay: string;
  balancePoints: number;
  reservedPoints: number;
  createdAt: Date;
  updatedAt: Date;
};

export type PointsLedgerRecord = {
  id: string;
  tenantId: string;
  guildId: string;
  emailNormalized: string;
  deltaPoints: number;
  eventType: string;
  orderSessionId: string | null;
  actorUserId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

function mapAccountRow(row: typeof customerPointsAccounts.$inferSelect): PointsAccountRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    guildId: row.guildId,
    emailNormalized: row.emailNormalized,
    emailDisplay: row.emailDisplay,
    balancePoints: row.balancePoints,
    reservedPoints: row.reservedPoints,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PointsRepository {
  private readonly db = getDb();

  public async getAccount(input: {
    tenantId: string;
    guildId: string;
    emailNormalized: string;
  }): Promise<PointsAccountRecord | null> {
    const row = await this.db.query.customerPointsAccounts.findFirst({
      where: and(
        eq(customerPointsAccounts.tenantId, input.tenantId),
        eq(customerPointsAccounts.guildId, input.guildId),
        eq(customerPointsAccounts.emailNormalized, input.emailNormalized),
      ),
    });

    if (!row) {
      return null;
    }

    return mapAccountRow(row);
  }

  public async listAccounts(input: {
    tenantId: string;
    guildId: string;
    search: string | null;
    limit: number;
  }): Promise<PointsAccountRecord[]> {
    const searchTrimmed = input.search?.trim() ?? '';
    const searchFilter = searchTrimmed
      ? or(
          like(customerPointsAccounts.emailNormalized, `%${searchTrimmed.toLowerCase()}%`),
          like(customerPointsAccounts.emailDisplay, `%${searchTrimmed}%`),
        )
      : null;

    const rows = await this.db.query.customerPointsAccounts.findMany({
      where: and(
        eq(customerPointsAccounts.tenantId, input.tenantId),
        eq(customerPointsAccounts.guildId, input.guildId),
        searchFilter ?? undefined,
      ),
      orderBy: [desc(customerPointsAccounts.updatedAt), asc(customerPointsAccounts.emailNormalized)],
      limit: input.limit,
    });

    return rows.map(mapAccountRow);
  }

  public async reservePoints(input: {
    tenantId: string;
    guildId: string;
    emailNormalized: string;
    emailDisplay: string;
    points: number;
  }): Promise<{ ok: true; account: PointsAccountRecord } | { ok: false; account: PointsAccountRecord | null }> {
    if (input.points <= 0) {
      const existing = await this.getAccount({
        tenantId: input.tenantId,
        guildId: input.guildId,
        emailNormalized: input.emailNormalized,
      });

      return {
        ok: true,
        account:
          existing ??
          ({
            id: '',
            tenantId: input.tenantId,
            guildId: input.guildId,
            emailNormalized: input.emailNormalized,
            emailDisplay: input.emailDisplay,
            balancePoints: 0,
            reservedPoints: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          } satisfies PointsAccountRecord),
      };
    }

    await this.db
      .update(customerPointsAccounts)
      .set({
        reservedPoints: sql`${customerPointsAccounts.reservedPoints} + ${input.points}`,
        emailDisplay: input.emailDisplay,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(customerPointsAccounts.tenantId, input.tenantId),
          eq(customerPointsAccounts.guildId, input.guildId),
          eq(customerPointsAccounts.emailNormalized, input.emailNormalized),
          sql`${customerPointsAccounts.balancePoints} - ${customerPointsAccounts.reservedPoints} >= ${input.points}`,
        ),
      );

    const account = await this.getAccount({
      tenantId: input.tenantId,
      guildId: input.guildId,
      emailNormalized: input.emailNormalized,
    });
    if (!account) {
      return { ok: false, account: null };
    }

    const availablePoints = account.balancePoints - account.reservedPoints;
    if (availablePoints < 0) {
      return { ok: false, account };
    }

    return {
      ok: true,
      account,
    };
  }

  public async releaseReservedPoints(input: {
    tenantId: string;
    guildId: string;
    emailNormalized: string;
    points: number;
  }): Promise<PointsAccountRecord | null> {
    const points = Math.max(0, input.points);
    if (points > 0) {
      await this.db
        .update(customerPointsAccounts)
        .set({
          reservedPoints: sql`greatest(0, ${customerPointsAccounts.reservedPoints} - ${points})`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(customerPointsAccounts.tenantId, input.tenantId),
            eq(customerPointsAccounts.guildId, input.guildId),
            eq(customerPointsAccounts.emailNormalized, input.emailNormalized),
          ),
        );
    }

    return this.getAccount({
      tenantId: input.tenantId,
      guildId: input.guildId,
      emailNormalized: input.emailNormalized,
    });
  }

  public async consumeReservedPoints(input: {
    tenantId: string;
    guildId: string;
    emailNormalized: string;
    points: number;
  }): Promise<PointsAccountRecord | null> {
    const points = Math.max(0, input.points);
    if (points > 0) {
      await this.db
        .update(customerPointsAccounts)
        .set({
          balancePoints: sql`greatest(0, ${customerPointsAccounts.balancePoints} - ${points})`,
          reservedPoints: sql`greatest(0, ${customerPointsAccounts.reservedPoints} - ${points})`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(customerPointsAccounts.tenantId, input.tenantId),
            eq(customerPointsAccounts.guildId, input.guildId),
            eq(customerPointsAccounts.emailNormalized, input.emailNormalized),
          ),
        );
    }

    return this.getAccount({
      tenantId: input.tenantId,
      guildId: input.guildId,
      emailNormalized: input.emailNormalized,
    });
  }

  public async addPoints(input: {
    tenantId: string;
    guildId: string;
    emailNormalized: string;
    emailDisplay: string;
    points: number;
  }): Promise<PointsAccountRecord> {
    const points = Math.max(0, input.points);
    await this.db
      .insert(customerPointsAccounts)
      .values({
        id: ulid(),
        tenantId: input.tenantId,
        guildId: input.guildId,
        emailNormalized: input.emailNormalized,
        emailDisplay: input.emailDisplay,
        balancePoints: points,
        reservedPoints: 0,
      })
      .onDuplicateKeyUpdate({
        set: {
          balancePoints: sql`${customerPointsAccounts.balancePoints} + ${points}`,
          emailDisplay: input.emailDisplay,
          updatedAt: new Date(),
        },
      });

    const account = await this.getAccount({
      tenantId: input.tenantId,
      guildId: input.guildId,
      emailNormalized: input.emailNormalized,
    });

    if (!account) {
      throw new Error('Failed to upsert points account');
    }

    return account;
  }

  public async removePointsClampToZero(input: {
    tenantId: string;
    guildId: string;
    emailNormalized: string;
    emailDisplay: string;
    points: number;
  }): Promise<{ account: PointsAccountRecord; removedPoints: number }> {
    const points = Math.max(0, input.points);
    const existing = await this.getAccount({
      tenantId: input.tenantId,
      guildId: input.guildId,
      emailNormalized: input.emailNormalized,
    });

    if (!existing) {
      await this.db.insert(customerPointsAccounts).values({
        id: ulid(),
        tenantId: input.tenantId,
        guildId: input.guildId,
        emailNormalized: input.emailNormalized,
        emailDisplay: input.emailDisplay,
        balancePoints: 0,
        reservedPoints: 0,
      });

      const created = await this.getAccount({
        tenantId: input.tenantId,
        guildId: input.guildId,
        emailNormalized: input.emailNormalized,
      });
      if (!created) {
        throw new Error('Failed to create points account');
      }

      return { account: created, removedPoints: 0 };
    }

    const removedPoints = Math.min(existing.balancePoints, points);

    await this.db
      .update(customerPointsAccounts)
      .set({
        balancePoints: sql`greatest(0, ${customerPointsAccounts.balancePoints} - ${removedPoints})`,
        emailDisplay: input.emailDisplay,
        updatedAt: new Date(),
      })
      .where(eq(customerPointsAccounts.id, existing.id));

    const account = await this.getAccount({
      tenantId: input.tenantId,
      guildId: input.guildId,
      emailNormalized: input.emailNormalized,
    });
    if (!account) {
      throw new Error('Failed to update points account');
    }

    return { account, removedPoints };
  }

  public async insertLedgerEvent(input: {
    tenantId: string;
    guildId: string;
    emailNormalized: string;
    deltaPoints: number;
    eventType: string;
    orderSessionId?: string | null;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<PointsLedgerRecord> {
    const id = ulid();
    const createdAt = new Date();
    await this.db.insert(customerPointsLedger).values({
      id,
      tenantId: input.tenantId,
      guildId: input.guildId,
      emailNormalized: input.emailNormalized,
      deltaPoints: input.deltaPoints,
      eventType: input.eventType,
      orderSessionId: input.orderSessionId ?? null,
      actorUserId: input.actorUserId ?? null,
      metadata: input.metadata ?? {},
      createdAt,
    });

    return {
      id,
      tenantId: input.tenantId,
      guildId: input.guildId,
      emailNormalized: input.emailNormalized,
      deltaPoints: input.deltaPoints,
      eventType: input.eventType,
      orderSessionId: input.orderSessionId ?? null,
      actorUserId: input.actorUserId ?? null,
      metadata: input.metadata ?? {},
      createdAt,
    };
  }
}
