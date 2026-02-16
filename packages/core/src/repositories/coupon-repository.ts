import { and, asc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { getDb } from '../infra/db/client.js';
import { discountCoupons } from '../infra/db/schema/index.js';

export type CouponRecord = {
  id: string;
  tenantId: string;
  guildId: string;
  code: string;
  discountMinor: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export class CouponRepository {
  private readonly db = getDb();

  public async listByGuild(input: { tenantId: string; guildId: string }): Promise<CouponRecord[]> {
    const rows = await this.db.query.discountCoupons.findMany({
      where: and(eq(discountCoupons.tenantId, input.tenantId), eq(discountCoupons.guildId, input.guildId)),
      orderBy: [asc(discountCoupons.createdAt)],
    });

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      guildId: row.guildId,
      code: row.code,
      discountMinor: row.discountMinor,
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  public async getByCode(input: {
    tenantId: string;
    guildId: string;
    code: string;
  }): Promise<CouponRecord | null> {
    const row = await this.db.query.discountCoupons.findFirst({
      where: and(
        eq(discountCoupons.tenantId, input.tenantId),
        eq(discountCoupons.guildId, input.guildId),
        eq(discountCoupons.code, input.code),
      ),
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      tenantId: row.tenantId,
      guildId: row.guildId,
      code: row.code,
      discountMinor: row.discountMinor,
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  public async create(input: {
    tenantId: string;
    guildId: string;
    code: string;
    discountMinor: number;
    active: boolean;
  }): Promise<CouponRecord> {
    const id = ulid();
    await this.db.insert(discountCoupons).values({
      id,
      tenantId: input.tenantId,
      guildId: input.guildId,
      code: input.code,
      discountMinor: input.discountMinor,
      active: input.active,
    });

    return {
      id,
      tenantId: input.tenantId,
      guildId: input.guildId,
      code: input.code,
      discountMinor: input.discountMinor,
      active: input.active,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  public async update(input: {
    tenantId: string;
    guildId: string;
    couponId: string;
    code: string;
    discountMinor: number;
    active: boolean;
  }): Promise<void> {
    await this.db
      .update(discountCoupons)
      .set({
        code: input.code,
        discountMinor: input.discountMinor,
        active: input.active,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(discountCoupons.id, input.couponId),
          eq(discountCoupons.tenantId, input.tenantId),
          eq(discountCoupons.guildId, input.guildId),
        ),
      );
  }

  public async delete(input: { tenantId: string; guildId: string; couponId: string }): Promise<void> {
    await this.db
      .delete(discountCoupons)
      .where(
        and(
          eq(discountCoupons.id, input.couponId),
          eq(discountCoupons.tenantId, input.tenantId),
          eq(discountCoupons.guildId, input.guildId),
        ),
      );
  }
}
