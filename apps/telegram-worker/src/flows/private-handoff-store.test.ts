import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TELEGRAM_PRIVATE_HANDOFF_TTL_MS,
  createTelegramPrivateHandoff,
  getTelegramPrivateHandoff,
  removeTelegramPrivateHandoff,
} from './private-handoff-store.js';

describe('telegram private handoff store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T18:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates handoffs with a six-hour ttl and refreshes on read', () => {
    const handoff = createTelegramPrivateHandoff({
      kind: 'points',
      tenantId: 'tenant-1',
      guildId: 'guild-1',
      requesterTelegramUserId: 'tg:123',
    });

    expect(handoff.expiresAt).toBe(Date.now() + TELEGRAM_PRIVATE_HANDOFF_TTL_MS);

    vi.advanceTimersByTime(90 * 60 * 1000);
    const refreshed = getTelegramPrivateHandoff(handoff.id);

    expect(refreshed).not.toBeNull();
    expect(refreshed?.expiresAt).toBe(Date.now() + TELEGRAM_PRIVATE_HANDOFF_TTL_MS);

    removeTelegramPrivateHandoff(handoff.id);
  });

  it('expires handoffs after the full ttl window', () => {
    const handoff = createTelegramPrivateHandoff({
      kind: 'refer',
      tenantId: 'tenant-1',
      guildId: 'guild-1',
      requesterTelegramUserId: 'tg:123',
      chatTitle: 'Main Group',
    });

    vi.advanceTimersByTime(TELEGRAM_PRIVATE_HANDOFF_TTL_MS + 1);

    expect(getTelegramPrivateHandoff(handoff.id)).toBeNull();
  });
});
