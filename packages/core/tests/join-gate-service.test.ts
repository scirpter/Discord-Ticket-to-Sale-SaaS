import { describe, expect, it } from 'vitest';

import {
  extractJoinGateEmailsFromMessage,
  JoinGateService,
  validateJoinGateConfig,
  type JoinGateMessageLike,
  type JoinGateRepositoryLike,
} from '../src/services/join-gate-service.js';
import type {
  JoinGateEmailIndexRecord,
  JoinGateMemberRecord,
  JoinGateLookupType,
  JoinGateSelectionPath,
} from '../src/repositories/join-gate-repository.js';

function now(): Date {
  return new Date('2026-03-19T12:00:00.000Z');
}

function makeMember(overrides: Partial<JoinGateMemberRecord> = {}): JoinGateMemberRecord {
  return {
    id: '01J0JOINGATEMEMBER000000001',
    tenantId: '01J0TENANT0000000000000001',
    guildId: '123456789012345678',
    discordUserId: '223456789012345678',
    status: 'pending',
    selectedPath: null,
    failedAttempts: 0,
    verifiedEmailNormalized: null,
    verifiedEmailDisplay: null,
    ticketChannelId: null,
    dmStatus: 'unknown',
    joinedAt: now(),
    selectedAt: null,
    matchedAt: null,
    verifiedAt: null,
    kickedAt: null,
    dmSentAt: null,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

function makeLookupEntry(overrides: Partial<JoinGateEmailIndexRecord> = {}): JoinGateEmailIndexRecord {
  return {
    id: '01J0JOINGATELOOKUP000000001',
    tenantId: '01J0TENANT0000000000000001',
    guildId: '123456789012345678',
    lookupType: 'current_customer',
    sourceChannelId: '333456789012345678',
    sourceMessageId: '444456789012345678',
    emailNormalized: 'customer@example.com',
    emailDisplay: 'customer@example.com',
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

class InMemoryJoinGateRepository implements JoinGateRepositoryLike {
  public readonly members = new Map<string, JoinGateMemberRecord>();
  public readonly lookupEntries = new Map<string, JoinGateEmailIndexRecord>();

  private memberKey(input: { tenantId: string; guildId: string; discordUserId: string }): string {
    return [input.tenantId, input.guildId, input.discordUserId].join(':');
  }

  private lookupKey(input: {
    tenantId: string;
    guildId: string;
    lookupType: JoinGateLookupType;
    emailNormalized: string;
  }): string {
    return [input.tenantId, input.guildId, input.lookupType, input.emailNormalized].join(':');
  }

  public async upsertMemberOnJoin(input: {
    tenantId: string;
    guildId: string;
    discordUserId: string;
  }): Promise<JoinGateMemberRecord> {
    const key = this.memberKey(input);
    const existing = this.members.get(key);
    const record = existing ?? makeMember({ tenantId: input.tenantId, guildId: input.guildId, discordUserId: input.discordUserId });
    const reset = makeMember({
      tenantId: input.tenantId,
      guildId: input.guildId,
      discordUserId: input.discordUserId,
    });

    const next = existing
      ? {
          ...existing,
          ...reset,
          id: existing.id,
          createdAt: existing.createdAt,
        }
      : record;

    this.members.set(key, next);
    return next;
  }

  public async getMember(input: {
    tenantId: string;
    guildId: string;
    discordUserId: string;
  }): Promise<JoinGateMemberRecord | null> {
    return this.members.get(this.memberKey(input)) ?? null;
  }

  public async setMemberSelection(input: {
    tenantId: string;
    guildId: string;
    discordUserId: string;
    path: JoinGateSelectionPath;
  }): Promise<JoinGateMemberRecord> {
    const key = this.memberKey(input);
    const existing = this.members.get(key) ?? makeMember({
      tenantId: input.tenantId,
      guildId: input.guildId,
      discordUserId: input.discordUserId,
    });
    const nowValue = now();
    const next = {
      ...existing,
      selectedPath: input.path,
      status: 'awaiting_email' as const,
      selectedAt: nowValue,
      updatedAt: nowValue,
    };
    this.members.set(key, next);
    return next;
  }

  public async recordDmStatus(input: {
    tenantId: string;
    guildId: string;
    discordUserId: string;
    dmStatus: 'unknown' | 'sent' | 'blocked' | 'failed';
  }): Promise<JoinGateMemberRecord> {
    const key = this.memberKey(input);
    const existing = this.members.get(key) ?? makeMember({
      tenantId: input.tenantId,
      guildId: input.guildId,
      discordUserId: input.discordUserId,
    });
    const nowValue = now();
    const next = {
      ...existing,
      dmStatus: input.dmStatus,
      dmSentAt: input.dmStatus === 'sent' ? nowValue : null,
      updatedAt: nowValue,
    };
    this.members.set(key, next);
    return next;
  }

  public async incrementFailedAttempts(input: {
    tenantId: string;
    guildId: string;
    discordUserId: string;
  }): Promise<JoinGateMemberRecord> {
    const key = this.memberKey(input);
    const existing = this.members.get(key) ?? makeMember({
      tenantId: input.tenantId,
      guildId: input.guildId,
      discordUserId: input.discordUserId,
    });
    const nowValue = now();
    const next = {
      ...existing,
      failedAttempts: existing.failedAttempts + 1,
      updatedAt: nowValue,
    };
    this.members.set(key, next);
    return next;
  }

  public async markMemberMatched(input: {
    tenantId: string;
    guildId: string;
    discordUserId: string;
    path: JoinGateSelectionPath;
    emailNormalized: string;
    emailDisplay: string;
  }): Promise<JoinGateMemberRecord> {
    const key = this.memberKey(input);
    const existing = this.members.get(key) ?? makeMember({
      tenantId: input.tenantId,
      guildId: input.guildId,
      discordUserId: input.discordUserId,
    });
    const nowValue = now();
    const next = {
      ...existing,
      selectedPath: input.path,
      status: 'matched' as const,
      verifiedEmailNormalized: input.emailNormalized,
      verifiedEmailDisplay: input.emailDisplay,
      matchedAt: nowValue,
      updatedAt: nowValue,
    };
    this.members.set(key, next);
    return next;
  }

  public async completeVerification(input: {
    tenantId: string;
    guildId: string;
    discordUserId: string;
    ticketChannelId: string;
  }): Promise<JoinGateMemberRecord> {
    const key = this.memberKey(input);
    const existing = this.members.get(key) ?? makeMember({
      tenantId: input.tenantId,
      guildId: input.guildId,
      discordUserId: input.discordUserId,
    });
    const nowValue = now();
    const next = {
      ...existing,
      status: 'verified' as const,
      ticketChannelId: input.ticketChannelId,
      verifiedAt: nowValue,
      updatedAt: nowValue,
    };
    this.members.set(key, next);
    return next;
  }

  public async markMemberKicked(input: {
    tenantId: string;
    guildId: string;
    discordUserId: string;
  }): Promise<JoinGateMemberRecord> {
    const key = this.memberKey(input);
    const existing = this.members.get(key) ?? makeMember({
      tenantId: input.tenantId,
      guildId: input.guildId,
      discordUserId: input.discordUserId,
    });
    const nowValue = now();
    const next = {
      ...existing,
      status: 'kicked' as const,
      kickedAt: nowValue,
      updatedAt: nowValue,
    };
    this.members.set(key, next);
    return next;
  }

  public async findLookupEntry(input: {
    tenantId: string;
    guildId: string;
    lookupType: JoinGateLookupType;
    emailNormalized: string;
  }): Promise<JoinGateEmailIndexRecord | null> {
    return this.lookupEntries.get(this.lookupKey(input)) ?? null;
  }

  public async replaceLookupMessageEntries(input: {
    tenantId: string;
    guildId: string;
    lookupType: JoinGateLookupType;
    sourceChannelId: string;
    sourceMessageId: string;
    emails: Array<{ emailNormalized: string; emailDisplay: string }>;
  }): Promise<JoinGateEmailIndexRecord[]> {
    const removed = await this.deleteLookupMessageEntries(input);
    void removed;

    const entries = input.emails.map((email, index) => {
      const record = makeLookupEntry({
        tenantId: input.tenantId,
        guildId: input.guildId,
        lookupType: input.lookupType,
        sourceChannelId: input.sourceChannelId,
        sourceMessageId: input.sourceMessageId,
        emailNormalized: email.emailNormalized,
        emailDisplay: email.emailDisplay,
        id: `01J0JOINGATEL${String(index).padStart(14, '0')}`,
      });
      this.lookupEntries.set(this.lookupKey(record), record);
      return record;
    });

    return entries;
  }

  public async deleteLookupMessageEntries(input: {
    tenantId: string;
    guildId: string;
    lookupType: JoinGateLookupType;
    sourceChannelId: string;
    sourceMessageId: string;
  }): Promise<number> {
    let removed = 0;
    for (const [key, entry] of this.lookupEntries.entries()) {
      if (
        entry.tenantId === input.tenantId &&
        entry.guildId === input.guildId &&
        entry.lookupType === input.lookupType &&
        entry.sourceChannelId === input.sourceChannelId &&
        entry.sourceMessageId === input.sourceMessageId
      ) {
        this.lookupEntries.delete(key);
        removed += 1;
      }
    }

    return removed;
  }
}

describe('join gate service', () => {
  it('validates enabled join-gate config before persistence', () => {
    const result = validateJoinGateConfig({
      joinGateEnabled: true,
      joinGateFallbackChannelId: null,
      joinGateVerifiedRoleId: null,
      joinGateTicketCategoryId: null,
      joinGateCurrentLookupChannelId: null,
      joinGateNewLookupChannelId: null,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }

    expect(result.error.code).toBe('JOIN_GATE_CONFIG_INVALID');
  });

  it('extracts and deduplicates emails from message content and embeds', () => {
    const message: JoinGateMessageLike = {
      content: 'Reach us at Current@example.com or billing@example.com.',
      embeds: [
        {
          title: 'Customer record',
          description: 'Backup contact: current@example.com',
          fields: [{ name: 'Referral', value: 'new@example.com' }],
          footer: { text: 'Footer with sales@example.com' },
        },
      ],
    };

    expect(extractJoinGateEmailsFromMessage(message).map((entry) => entry.emailNormalized)).toEqual([
      'current@example.com',
      'billing@example.com',
      'new@example.com',
      'sales@example.com',
    ]);
  });

  it('matches emails, opens the verification state, and preserves shared fail counts', async () => {
    const repository = new InMemoryJoinGateRepository();
    repository.lookupEntries.set(
      '01J0TENANT0000000000000001:123456789012345678:current_customer:customer@example.com',
      makeLookupEntry(),
    );

    const service = new JoinGateService(repository);
    const member = await service.registerJoin({
      tenantId: '01J0TENANT0000000000000001',
      guildId: '123456789012345678',
      discordUserId: '223456789012345678',
    });
    expect(member.isOk()).toBe(true);

    const selection = await service.setSelection({
      tenantId: '01J0TENANT0000000000000001',
      guildId: '123456789012345678',
      discordUserId: '223456789012345678',
      path: 'current_customer',
    });
    expect(selection.isOk()).toBe(true);

    const matched = await service.submitEmail({
      tenantId: '01J0TENANT0000000000000001',
      guildId: '123456789012345678',
      discordUserId: '223456789012345678',
      path: 'current_customer',
      email: 'customer@example.com',
    });

    expect(matched.isOk()).toBe(true);
    if (matched.isErr()) {
      return;
    }

    expect(matched.value.status).toBe('matched');
    expect(matched.value.member.status).toBe('matched');
    expect(matched.value.member.verifiedEmailNormalized).toBe('customer@example.com');

    const completed = await service.completeVerification({
      tenantId: '01J0TENANT0000000000000001',
      guildId: '123456789012345678',
      discordUserId: '223456789012345678',
      ticketChannelId: '555456789012345678',
    });

    expect(completed.isOk()).toBe(true);
    if (completed.isErr()) {
      return;
    }

    expect(completed.value.status).toBe('verified');
    expect(completed.value.ticketChannelId).toBe('555456789012345678');
  });

  it('kicks after three failed attempts across both paths', async () => {
    const repository = new InMemoryJoinGateRepository();
    const service = new JoinGateService(repository);

    await service.registerJoin({
      tenantId: '01J0TENANT0000000000000001',
      guildId: '123456789012345678',
      discordUserId: '223456789012345678',
    });

    await service.setSelection({
      tenantId: '01J0TENANT0000000000000001',
      guildId: '123456789012345678',
      discordUserId: '223456789012345678',
      path: 'current_customer',
    });

    const first = await service.submitEmail({
      tenantId: '01J0TENANT0000000000000001',
      guildId: '123456789012345678',
      discordUserId: '223456789012345678',
      path: 'current_customer',
      email: 'missing-1@example.com',
    });
    expect(first.isOk()).toBe(true);
    if (first.isErr()) {
      return;
    }
    expect(first.value.status).toBe('retry');

    await service.setSelection({
      tenantId: '01J0TENANT0000000000000001',
      guildId: '123456789012345678',
      discordUserId: '223456789012345678',
      path: 'new_customer',
    });

    const second = await service.submitEmail({
      tenantId: '01J0TENANT0000000000000001',
      guildId: '123456789012345678',
      discordUserId: '223456789012345678',
      path: 'new_customer',
      email: 'missing-2@example.com',
    });
    expect(second.isOk()).toBe(true);
    if (second.isErr()) {
      return;
    }
    expect(second.value.status).toBe('retry');

    const third = await service.submitEmail({
      tenantId: '01J0TENANT0000000000000001',
      guildId: '123456789012345678',
      discordUserId: '223456789012345678',
      path: 'current_customer',
      email: 'missing-3@example.com',
    });

    expect(third.isOk()).toBe(true);
    if (third.isErr()) {
      return;
    }

    expect(third.value.status).toBe('kick_required');
    expect(third.value.member.status).toBe('awaiting_email');
    expect(third.value.member.failedAttempts).toBe(3);

    const kicked = await service.markKicked({
      tenantId: '01J0TENANT0000000000000001',
      guildId: '123456789012345678',
      discordUserId: '223456789012345678',
    });

    expect(kicked.isOk()).toBe(true);
    if (kicked.isErr()) {
      return;
    }

    expect(kicked.value.status).toBe('kicked');
  });
});
