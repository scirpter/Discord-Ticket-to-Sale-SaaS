import { and, asc, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { getDb } from '../infra/db/client.js';
import { guildConfigs, tenantGuilds, tenantMembers, tenants } from '../infra/db/schema/index.js';

export type TenantRecord = {
  id: string;
  name: string;
  status: 'active' | 'disabled';
  ownerUserId: string;
  createdAt: Date;
};

export type GuildConfigRecord = {
  id: string;
  tenantId: string;
  guildId: string;
  paidLogChannelId: string | null;
  staffRoleIds: string[];
  defaultCurrency: string;
  ticketMetadataKey: string;
};

export class TenantRepository {
  private readonly db = getDb();

  public async createTenant(input: {
    name: string;
    ownerUserId: string;
  }): Promise<TenantRecord> {
    const tenantId = ulid();

    await this.db.transaction(async (tx) => {
      await tx.insert(tenants).values({
        id: tenantId,
        name: input.name,
        ownerUserId: input.ownerUserId,
        status: 'active',
      });

      await tx.insert(tenantMembers).values({
        id: ulid(),
        tenantId,
        userId: input.ownerUserId,
        role: 'owner',
      });
    });

    const created = await this.db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
    });

    if (!created) {
      throw new Error('Failed to create tenant');
    }

    return {
      id: created.id,
      name: created.name,
      status: created.status,
      ownerUserId: created.ownerUserId,
      createdAt: created.createdAt,
    };
  }

  public async listTenantsForUser(userId: string): Promise<TenantRecord[]> {
    const memberships = await this.db.query.tenantMembers.findMany({
      where: eq(tenantMembers.userId, userId),
      orderBy: [asc(tenantMembers.createdAt)],
    });

    if (memberships.length === 0) {
      return [];
    }

    const items: TenantRecord[] = [];
    for (const membership of memberships) {
      const tenant = await this.db.query.tenants.findFirst({
        where: eq(tenants.id, membership.tenantId),
      });

      if (tenant) {
        items.push({
          id: tenant.id,
          name: tenant.name,
          status: tenant.status,
          ownerUserId: tenant.ownerUserId,
          createdAt: tenant.createdAt,
        });
      }
    }

    return items;
  }

  public async listAllTenants(): Promise<TenantRecord[]> {
    const rows = await this.db.query.tenants.findMany({
      orderBy: [desc(tenants.createdAt)],
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      ownerUserId: row.ownerUserId,
      createdAt: row.createdAt,
    }));
  }

  public async getTenantById(tenantId: string): Promise<TenantRecord | null> {
    const row = await this.db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      status: row.status,
      ownerUserId: row.ownerUserId,
      createdAt: row.createdAt,
    };
  }

  public async updateTenant(input: {
    tenantId: string;
    name?: string;
  }): Promise<void> {
    await this.db
      .update(tenants)
      .set({
        ...(input.name ? { name: input.name } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, input.tenantId));
  }

  public async setTenantStatus(input: {
    tenantId: string;
    status: 'active' | 'disabled';
  }): Promise<void> {
    await this.db
      .update(tenants)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(tenants.id, input.tenantId));
  }

  public async connectGuild(input: {
    tenantId: string;
    guildId: string;
    guildName: string;
  }): Promise<void> {
    const existing = await this.db.query.tenantGuilds.findFirst({
      where: and(eq(tenantGuilds.tenantId, input.tenantId), eq(tenantGuilds.guildId, input.guildId)),
    });

    if (existing) {
      await this.db
        .update(tenantGuilds)
        .set({ guildName: input.guildName, updatedAt: new Date() })
        .where(eq(tenantGuilds.id, existing.id));
      return;
    }

    await this.db.transaction(async (tx) => {
      await tx.insert(tenantGuilds).values({
        id: ulid(),
        tenantId: input.tenantId,
        guildId: input.guildId,
        guildName: input.guildName,
      });

      await tx.insert(guildConfigs).values({
        id: ulid(),
        tenantId: input.tenantId,
        guildId: input.guildId,
        paidLogChannelId: null,
        staffRoleIds: [],
        defaultCurrency: 'USD',
        ticketMetadataKey: 'isTicket',
      });
    });
  }

  public async listGuildsForTenant(tenantId: string): Promise<Array<{ guildId: string; guildName: string }>> {
    const rows = await this.db.query.tenantGuilds.findMany({
      where: eq(tenantGuilds.tenantId, tenantId),
      orderBy: [asc(tenantGuilds.guildName)],
    });

    return rows.map((row) => ({ guildId: row.guildId, guildName: row.guildName }));
  }

  public async getTenantByGuildId(guildId: string): Promise<{ tenantId: string; guildId: string } | null> {
    const row = await this.db.query.tenantGuilds.findFirst({
      where: eq(tenantGuilds.guildId, guildId),
    });

    if (!row) {
      return null;
    }

    return {
      tenantId: row.tenantId,
      guildId: row.guildId,
    };
  }

  public async getTenantGuild(input: {
    tenantId: string;
    guildId: string;
  }): Promise<{ tenantId: string; guildId: string; guildName: string } | null> {
    const row = await this.db.query.tenantGuilds.findFirst({
      where: and(eq(tenantGuilds.tenantId, input.tenantId), eq(tenantGuilds.guildId, input.guildId)),
    });

    if (!row) {
      return null;
    }

    return {
      tenantId: row.tenantId,
      guildId: row.guildId,
      guildName: row.guildName,
    };
  }

  public async getGuildConfig(input: {
    tenantId: string;
    guildId: string;
  }): Promise<GuildConfigRecord | null> {
    const row = await this.db.query.guildConfigs.findFirst({
      where: and(eq(guildConfigs.tenantId, input.tenantId), eq(guildConfigs.guildId, input.guildId)),
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      tenantId: row.tenantId,
      guildId: row.guildId,
      paidLogChannelId: row.paidLogChannelId,
      staffRoleIds: row.staffRoleIds,
      defaultCurrency: row.defaultCurrency,
      ticketMetadataKey: row.ticketMetadataKey,
    };
  }

  public async upsertGuildConfig(input: {
    tenantId: string;
    guildId: string;
    paidLogChannelId: string | null;
    staffRoleIds: string[];
    defaultCurrency: string;
    ticketMetadataKey: string;
  }): Promise<GuildConfigRecord> {
    const existing = await this.db.query.guildConfigs.findFirst({
      where: and(eq(guildConfigs.tenantId, input.tenantId), eq(guildConfigs.guildId, input.guildId)),
    });

    if (existing) {
      await this.db
        .update(guildConfigs)
        .set({
          paidLogChannelId: input.paidLogChannelId,
          staffRoleIds: input.staffRoleIds,
          defaultCurrency: input.defaultCurrency,
          ticketMetadataKey: input.ticketMetadataKey,
          updatedAt: new Date(),
        })
        .where(eq(guildConfigs.id, existing.id));

      return {
        id: existing.id,
        tenantId: existing.tenantId,
        guildId: existing.guildId,
        paidLogChannelId: input.paidLogChannelId,
        staffRoleIds: input.staffRoleIds,
        defaultCurrency: input.defaultCurrency,
        ticketMetadataKey: input.ticketMetadataKey,
      };
    }

    const id = ulid();
    await this.db.insert(guildConfigs).values({
      id,
      tenantId: input.tenantId,
      guildId: input.guildId,
      paidLogChannelId: input.paidLogChannelId,
      staffRoleIds: input.staffRoleIds,
      defaultCurrency: input.defaultCurrency,
      ticketMetadataKey: input.ticketMetadataKey,
    });

    return {
      id,
      tenantId: input.tenantId,
      guildId: input.guildId,
      paidLogChannelId: input.paidLogChannelId,
      staffRoleIds: input.staffRoleIds,
      defaultCurrency: input.defaultCurrency,
      ticketMetadataKey: input.ticketMetadataKey,
    };
  }
}
