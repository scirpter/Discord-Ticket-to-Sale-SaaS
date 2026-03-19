import { and, count, eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';

import { getDb } from '../infra/db/client.js';
import { joinGateEmailIndex, joinGateMembers } from '../infra/db/schema/index.js';

export type JoinGateSelectionPath = 'current_customer' | 'new_customer';
export type JoinGateLookupType = 'current_customer' | 'new_customer';
export type JoinGateNormalizedEmail = {
  emailDisplay: string;
  emailNormalized: string;
};

export type JoinGateMemberStatus = 'pending' | 'awaiting_email' | 'matched' | 'verified' | 'kicked';
export type JoinGateDmStatus = 'unknown' | 'sent' | 'blocked' | 'failed';

export type JoinGateMemberRecord = {
  id: string;
  tenantId: string;
  guildId: string;
  discordUserId: string;
  status: JoinGateMemberStatus;
  selectedPath: JoinGateSelectionPath | null;
  failedAttempts: number;
  verifiedEmailNormalized: string | null;
  verifiedEmailDisplay: string | null;
  ticketChannelId: string | null;
  dmStatus: JoinGateDmStatus;
  joinedAt: Date;
  selectedAt: Date | null;
  matchedAt: Date | null;
  verifiedAt: Date | null;
  kickedAt: Date | null;
  dmSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type JoinGateEmailIndexRecord = {
  id: string;
  tenantId: string;
  guildId: string;
  lookupType: JoinGateLookupType;
  sourceChannelId: string;
  sourceMessageId: string;
  emailNormalized: string;
  emailDisplay: string;
  createdAt: Date;
  updatedAt: Date;
};

function mapMemberRow(row: typeof joinGateMembers.$inferSelect): JoinGateMemberRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    guildId: row.guildId,
    discordUserId: row.discordUserId,
    status: row.status,
    selectedPath: row.selectedPath,
    failedAttempts: row.failedAttempts,
    verifiedEmailNormalized: row.verifiedEmailNormalized,
    verifiedEmailDisplay: row.verifiedEmailDisplay,
    ticketChannelId: row.ticketChannelId,
    dmStatus: row.dmStatus,
    joinedAt: row.joinedAt,
    selectedAt: row.selectedAt,
    matchedAt: row.matchedAt,
    verifiedAt: row.verifiedAt,
    kickedAt: row.kickedAt,
    dmSentAt: row.dmSentAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapEmailIndexRow(row: typeof joinGateEmailIndex.$inferSelect): JoinGateEmailIndexRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    guildId: row.guildId,
    lookupType: row.lookupType,
    sourceChannelId: row.sourceChannelId,
    sourceMessageId: row.sourceMessageId,
    emailNormalized: row.emailNormalized,
    emailDisplay: row.emailDisplay,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class JoinGateRepository {
  private readonly db = getDb();

  public async upsertMemberOnJoin(input: {
    tenantId: string;
    guildId: string;
    discordUserId: string;
  }): Promise<JoinGateMemberRecord> {
    const id = ulid();
    const joinedAt = new Date();

    await this.db
      .insert(joinGateMembers)
      .values({
        id,
        tenantId: input.tenantId,
        guildId: input.guildId,
        discordUserId: input.discordUserId,
        status: 'pending',
        selectedPath: null,
        failedAttempts: 0,
        verifiedEmailNormalized: null,
        verifiedEmailDisplay: null,
        ticketChannelId: null,
        dmStatus: 'unknown',
        joinedAt,
        selectedAt: null,
        matchedAt: null,
        verifiedAt: null,
        kickedAt: null,
        dmSentAt: null,
      })
      .onDuplicateKeyUpdate({
        set: {
          status: 'pending',
          selectedPath: null,
          failedAttempts: 0,
          verifiedEmailNormalized: null,
          verifiedEmailDisplay: null,
          ticketChannelId: null,
          dmStatus: 'unknown',
          joinedAt,
          selectedAt: null,
          matchedAt: null,
          verifiedAt: null,
          kickedAt: null,
          dmSentAt: null,
          updatedAt: new Date(),
        },
      });

    const row = await this.db.query.joinGateMembers.findFirst({
      where: and(
        eq(joinGateMembers.tenantId, input.tenantId),
        eq(joinGateMembers.guildId, input.guildId),
        eq(joinGateMembers.discordUserId, input.discordUserId),
      ),
    });

    if (!row) {
      throw new Error('Failed to load join gate member record');
    }

    return mapMemberRow(row);
  }

  public async getMember(input: {
    tenantId: string;
    guildId: string;
    discordUserId: string;
  }): Promise<JoinGateMemberRecord | null> {
    const row = await this.db.query.joinGateMembers.findFirst({
      where: and(
        eq(joinGateMembers.tenantId, input.tenantId),
        eq(joinGateMembers.guildId, input.guildId),
        eq(joinGateMembers.discordUserId, input.discordUserId),
      ),
    });

    return row ? mapMemberRow(row) : null;
  }

  public async setMemberSelection(input: {
    tenantId: string;
    guildId: string;
    discordUserId: string;
    path: JoinGateSelectionPath;
  }): Promise<JoinGateMemberRecord> {
    const now = new Date();
    await this.db
      .update(joinGateMembers)
      .set({
        selectedPath: input.path,
        status: 'awaiting_email',
        selectedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(joinGateMembers.tenantId, input.tenantId),
          eq(joinGateMembers.guildId, input.guildId),
          eq(joinGateMembers.discordUserId, input.discordUserId),
        ),
      );

    const record = await this.getMember(input);
    if (!record) {
      throw new Error('Failed to load selected join gate member record');
    }

    return record;
  }

  public async recordDmStatus(input: {
    tenantId: string;
    guildId: string;
    discordUserId: string;
    dmStatus: JoinGateDmStatus;
  }): Promise<JoinGateMemberRecord> {
    const now = new Date();
    await this.db
      .update(joinGateMembers)
      .set({
        dmStatus: input.dmStatus,
        dmSentAt: input.dmStatus === 'sent' ? now : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(joinGateMembers.tenantId, input.tenantId),
          eq(joinGateMembers.guildId, input.guildId),
          eq(joinGateMembers.discordUserId, input.discordUserId),
        ),
      );

    const record = await this.getMember(input);
    if (!record) {
      throw new Error('Failed to load join gate member after dm status update');
    }

    return record;
  }

  public async incrementFailedAttempts(input: {
    tenantId: string;
    guildId: string;
    discordUserId: string;
  }): Promise<JoinGateMemberRecord> {
    const now = new Date();
    await this.db
      .update(joinGateMembers)
      .set({
        failedAttempts: sql`${joinGateMembers.failedAttempts} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(joinGateMembers.tenantId, input.tenantId),
          eq(joinGateMembers.guildId, input.guildId),
          eq(joinGateMembers.discordUserId, input.discordUserId),
        ),
      );

    const record = await this.getMember(input);
    if (!record) {
      throw new Error('Failed to load join gate member after failed attempt increment');
    }

    return record;
  }

  public async markMemberMatched(input: {
    tenantId: string;
    guildId: string;
    discordUserId: string;
    path: JoinGateSelectionPath;
    emailNormalized: string;
    emailDisplay: string;
  }): Promise<JoinGateMemberRecord> {
    const now = new Date();
    await this.db
      .update(joinGateMembers)
      .set({
        selectedPath: input.path,
        status: 'matched',
        verifiedEmailNormalized: input.emailNormalized,
        verifiedEmailDisplay: input.emailDisplay,
        matchedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(joinGateMembers.tenantId, input.tenantId),
          eq(joinGateMembers.guildId, input.guildId),
          eq(joinGateMembers.discordUserId, input.discordUserId),
        ),
      );

    const record = await this.getMember(input);
    if (!record) {
      throw new Error('Failed to load join gate member after match');
    }

    return record;
  }

  public async completeVerification(input: {
    tenantId: string;
    guildId: string;
    discordUserId: string;
    ticketChannelId: string;
  }): Promise<JoinGateMemberRecord> {
    const now = new Date();
    await this.db
      .update(joinGateMembers)
      .set({
        status: 'verified',
        ticketChannelId: input.ticketChannelId,
        verifiedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(joinGateMembers.tenantId, input.tenantId),
          eq(joinGateMembers.guildId, input.guildId),
          eq(joinGateMembers.discordUserId, input.discordUserId),
        ),
      );

    const record = await this.getMember(input);
    if (!record) {
      throw new Error('Failed to load join gate member after verification');
    }

    return record;
  }

  public async markMemberKicked(input: {
    tenantId: string;
    guildId: string;
    discordUserId: string;
  }): Promise<JoinGateMemberRecord> {
    const now = new Date();
    await this.db
      .update(joinGateMembers)
      .set({
        status: 'kicked',
        kickedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(joinGateMembers.tenantId, input.tenantId),
          eq(joinGateMembers.guildId, input.guildId),
          eq(joinGateMembers.discordUserId, input.discordUserId),
        ),
      );

    const record = await this.getMember(input);
    if (!record) {
      throw new Error('Failed to load join gate member after kick');
    }

    return record;
  }

  public async findLookupEntry(input: {
    tenantId: string;
    guildId: string;
    lookupType: JoinGateLookupType;
    emailNormalized: string;
  }): Promise<JoinGateEmailIndexRecord | null> {
    const row = await this.db.query.joinGateEmailIndex.findFirst({
      where: and(
        eq(joinGateEmailIndex.tenantId, input.tenantId),
        eq(joinGateEmailIndex.guildId, input.guildId),
        eq(joinGateEmailIndex.lookupType, input.lookupType),
        eq(joinGateEmailIndex.emailNormalized, input.emailNormalized),
      ),
    });

    return row ? mapEmailIndexRow(row) : null;
  }

  public async replaceLookupMessageEntries(input: {
    tenantId: string;
    guildId: string;
    lookupType: JoinGateLookupType;
    sourceChannelId: string;
    sourceMessageId: string;
    emails: JoinGateNormalizedEmail[];
  }): Promise<JoinGateEmailIndexRecord[]> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(joinGateEmailIndex)
        .where(
          and(
            eq(joinGateEmailIndex.tenantId, input.tenantId),
            eq(joinGateEmailIndex.guildId, input.guildId),
            eq(joinGateEmailIndex.lookupType, input.lookupType),
            eq(joinGateEmailIndex.sourceChannelId, input.sourceChannelId),
            eq(joinGateEmailIndex.sourceMessageId, input.sourceMessageId),
          ),
        );

      if (input.emails.length > 0) {
        await tx.insert(joinGateEmailIndex).values(
          input.emails.map((email) => ({
            id: ulid(),
            tenantId: input.tenantId,
            guildId: input.guildId,
            lookupType: input.lookupType,
            sourceChannelId: input.sourceChannelId,
            sourceMessageId: input.sourceMessageId,
            emailNormalized: email.emailNormalized,
            emailDisplay: email.emailDisplay,
          })),
        );
      }
    });

    if (input.emails.length === 0) {
      return [];
    }

    const rows = await Promise.all(
      input.emails.map(async (email) => {
        const record = await this.findLookupEntry({
          tenantId: input.tenantId,
          guildId: input.guildId,
          lookupType: input.lookupType,
          emailNormalized: email.emailNormalized,
        });

        if (!record) {
          throw new Error('Failed to load join gate lookup entry');
        }

        return record;
      }),
    );

    return rows;
  }

  public async deleteLookupMessageEntries(input: {
    tenantId: string;
    guildId: string;
    lookupType: JoinGateLookupType;
    sourceChannelId: string;
    sourceMessageId: string;
  }): Promise<number> {
    const existingEntries = await this.db.query.joinGateEmailIndex.findMany({
      where: and(
        eq(joinGateEmailIndex.tenantId, input.tenantId),
        eq(joinGateEmailIndex.guildId, input.guildId),
        eq(joinGateEmailIndex.lookupType, input.lookupType),
        eq(joinGateEmailIndex.sourceChannelId, input.sourceChannelId),
        eq(joinGateEmailIndex.sourceMessageId, input.sourceMessageId),
      ),
    });

    if (existingEntries.length === 0) {
      return 0;
    }

    await this.db
      .delete(joinGateEmailIndex)
      .where(
        and(
          eq(joinGateEmailIndex.tenantId, input.tenantId),
          eq(joinGateEmailIndex.guildId, input.guildId),
          eq(joinGateEmailIndex.lookupType, input.lookupType),
          eq(joinGateEmailIndex.sourceChannelId, input.sourceChannelId),
          eq(joinGateEmailIndex.sourceMessageId, input.sourceMessageId),
        ),
      );

    return existingEntries.length;
  }

  public async clearLookupSourceEntries(input: {
    tenantId: string;
    guildId: string;
    lookupType: JoinGateLookupType;
    sourceChannelId: string;
  }): Promise<number> {
    const existingEntries = await this.db.query.joinGateEmailIndex.findMany({
      where: and(
        eq(joinGateEmailIndex.tenantId, input.tenantId),
        eq(joinGateEmailIndex.guildId, input.guildId),
        eq(joinGateEmailIndex.lookupType, input.lookupType),
        eq(joinGateEmailIndex.sourceChannelId, input.sourceChannelId),
      ),
    });

    if (existingEntries.length === 0) {
      return 0;
    }

    await this.db
      .delete(joinGateEmailIndex)
      .where(
        and(
          eq(joinGateEmailIndex.tenantId, input.tenantId),
          eq(joinGateEmailIndex.guildId, input.guildId),
          eq(joinGateEmailIndex.lookupType, input.lookupType),
          eq(joinGateEmailIndex.sourceChannelId, input.sourceChannelId),
        ),
      );

    return existingEntries.length;
  }

  public async countLookupEntries(input: {
    tenantId: string;
    guildId: string;
    lookupType: JoinGateLookupType;
    sourceChannelId?: string | null;
  }): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(joinGateEmailIndex)
      .where(
        and(
          eq(joinGateEmailIndex.tenantId, input.tenantId),
          eq(joinGateEmailIndex.guildId, input.guildId),
          eq(joinGateEmailIndex.lookupType, input.lookupType),
          input.sourceChannelId ? eq(joinGateEmailIndex.sourceChannelId, input.sourceChannelId) : undefined,
        ),
      );

    return rows[0]?.value ?? 0;
  }
}
