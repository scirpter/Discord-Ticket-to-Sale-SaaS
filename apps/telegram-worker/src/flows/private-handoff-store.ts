import crypto from 'node:crypto';

export type TelegramPrivateHandoffKind = 'points' | 'refer';

export type TelegramPrivateHandoff = {
  id: string;
  kind: TelegramPrivateHandoffKind;
  tenantId: string;
  guildId: string;
  requesterTelegramUserId: string;
  chatTitle: string | null;
  expiresAt: number;
};

const handoffStore = new Map<string, TelegramPrivateHandoff>();

export const TELEGRAM_PRIVATE_HANDOFF_TTL_MS = 6 * 60 * 60 * 1000;

function createHandoffId(): string {
  return crypto.randomBytes(8).toString('hex');
}

function refreshHandoffExpiry(handoff: TelegramPrivateHandoff): TelegramPrivateHandoff {
  return {
    ...handoff,
    expiresAt: Date.now() + TELEGRAM_PRIVATE_HANDOFF_TTL_MS,
  };
}

export function createTelegramPrivateHandoff(input: {
  kind: TelegramPrivateHandoffKind;
  tenantId: string;
  guildId: string;
  requesterTelegramUserId: string;
  chatTitle?: string | null;
}): TelegramPrivateHandoff {
  const handoff: TelegramPrivateHandoff = {
    id: createHandoffId(),
    kind: input.kind,
    tenantId: input.tenantId,
    guildId: input.guildId,
    requesterTelegramUserId: input.requesterTelegramUserId,
    chatTitle: input.chatTitle ?? null,
    expiresAt: Date.now() + TELEGRAM_PRIVATE_HANDOFF_TTL_MS,
  };

  handoffStore.set(handoff.id, handoff);
  return handoff;
}

export function getTelegramPrivateHandoff(handoffId: string): TelegramPrivateHandoff | null {
  const handoff = handoffStore.get(handoffId);
  if (!handoff) {
    return null;
  }

  if (handoff.expiresAt < Date.now()) {
    handoffStore.delete(handoffId);
    return null;
  }

  const refreshedHandoff = refreshHandoffExpiry(handoff);
  handoffStore.set(handoffId, refreshedHandoff);
  return refreshedHandoff;
}

export function removeTelegramPrivateHandoff(handoffId: string): void {
  handoffStore.delete(handoffId);
}
