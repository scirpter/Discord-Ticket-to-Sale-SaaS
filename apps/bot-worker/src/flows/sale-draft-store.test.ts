import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SALE_DRAFT_TTL_MS,
  createSaleDraft,
  getSaleDraft,
  removeSaleDraft,
  updateSaleDraft,
} from './sale-draft-store.js';

describe('sale draft store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-07T18:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses a longer one-hour ttl for new drafts', () => {
    const draft = createSaleDraft({
      tenantId: 'tenant-1',
      guildId: 'guild-1',
      ticketChannelId: 'channel-1',
      staffDiscordUserId: 'staff-1',
      customerDiscordUserId: 'customer-1',
    });

    expect(draft.expiresAt).toBe(Date.now() + SALE_DRAFT_TTL_MS);

    removeSaleDraft(draft.id);
  });

  it('refreshes the expiry when the draft is read during active use', () => {
    const draft = createSaleDraft({
      tenantId: 'tenant-1',
      guildId: 'guild-1',
      ticketChannelId: 'channel-1',
      staffDiscordUserId: 'staff-1',
      customerDiscordUserId: 'customer-1',
    });

    vi.advanceTimersByTime(20 * 60 * 1000);
    const refreshed = getSaleDraft(draft.id);

    expect(refreshed).not.toBeNull();
    expect(refreshed?.expiresAt).toBe(Date.now() + SALE_DRAFT_TTL_MS);

    removeSaleDraft(draft.id);
  });

  it('expires drafts only after the full ttl window', () => {
    const draft = createSaleDraft({
      tenantId: 'tenant-1',
      guildId: 'guild-1',
      ticketChannelId: 'channel-1',
      staffDiscordUserId: 'staff-1',
      customerDiscordUserId: 'customer-1',
    });

    vi.advanceTimersByTime(SALE_DRAFT_TTL_MS + 1);

    expect(getSaleDraft(draft.id)).toBeNull();
  });

  it('refreshes expiry when the draft is updated', () => {
    const draft = createSaleDraft({
      tenantId: 'tenant-1',
      guildId: 'guild-1',
      ticketChannelId: 'channel-1',
      staffDiscordUserId: 'staff-1',
      customerDiscordUserId: 'customer-1',
    });

    vi.advanceTimersByTime(10 * 60 * 1000);
    updateSaleDraft({
      ...draft,
      category: 'Accounts',
    });

    const refreshed = getSaleDraft(draft.id);
    expect(refreshed?.category).toBe('Accounts');
    expect(refreshed?.expiresAt).toBe(Date.now() + SALE_DRAFT_TTL_MS);

    removeSaleDraft(draft.id);
  });
});
