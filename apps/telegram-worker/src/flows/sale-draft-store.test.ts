import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SALE_DRAFT_TTL_MS,
  clearSaleDraftsForChat,
  createSaleDraft,
  getSaleDraft,
  listSaleDraftsForControlChat,
  removeSaleDraft,
  updateSaleDraft,
} from './sale-draft-store.js';

describe('telegram sale draft store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T17:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps Telegram DM drafts alive for six hours and refreshes them on read', () => {
    const draft = createSaleDraft({
      tenantId: 'tenant-1',
      guildId: 'guild-1',
      ticketChannelId: 'tg:-100123',
      customerLabel: '@customer',
      staffDiscordUserId: 'tg:111',
      customerDiscordUserId: 'tg:222',
      defaultCurrency: 'GBP',
      tipEnabled: true,
    });

    expect(draft.expiresAt).toBe(Date.now() + SALE_DRAFT_TTL_MS);

    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    const refreshed = getSaleDraft(draft.id);

    expect(refreshed).not.toBeNull();
    expect(refreshed?.expiresAt).toBe(Date.now() + SALE_DRAFT_TTL_MS);

    removeSaleDraft(draft.id);
  });

  it('tracks DM control chats separately from the group status chat', () => {
    const draft = createSaleDraft({
      tenantId: 'tenant-1',
      guildId: 'guild-1',
      ticketChannelId: 'tg:-100123',
      customerLabel: '@customer',
      staffDiscordUserId: 'tg:111',
      customerDiscordUserId: 'tg:222',
      defaultCurrency: 'GBP',
      tipEnabled: true,
    });

    draft.controlChatId = 'tg:222';
    draft.controlMessageId = 55;
    updateSaleDraft(draft);

    expect(listSaleDraftsForControlChat('tg:222')).toHaveLength(1);

    clearSaleDraftsForChat('tg:-100123');
    expect(listSaleDraftsForControlChat('tg:222')).toHaveLength(0);
  });

  it('expires Telegram sale drafts only after the full ttl window', () => {
    const draft = createSaleDraft({
      tenantId: 'tenant-1',
      guildId: 'guild-1',
      ticketChannelId: 'tg:-100123',
      customerLabel: '@customer',
      staffDiscordUserId: 'tg:111',
      customerDiscordUserId: 'tg:222',
      defaultCurrency: 'GBP',
      tipEnabled: true,
    });

    vi.advanceTimersByTime(SALE_DRAFT_TTL_MS + 1);

    expect(getSaleDraft(draft.id)).toBeNull();
  });
});
