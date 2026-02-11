import crypto from 'node:crypto';

export type SaleDraft = {
  id: string;
  tenantId: string;
  guildId: string;
  ticketChannelId: string;
  staffDiscordUserId: string;
  customerDiscordUserId: string;
  productId: string | null;
  variantId: string | null;
  answers: Record<string, string>;
  expiresAt: number;
};

const draftStore = new Map<string, SaleDraft>();

const DRAFT_TTL_MS = 15 * 60 * 1000;

export function createSaleDraft(input: {
  tenantId: string;
  guildId: string;
  ticketChannelId: string;
  staffDiscordUserId: string;
  customerDiscordUserId: string;
}): SaleDraft {
  const draft: SaleDraft = {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    guildId: input.guildId,
    ticketChannelId: input.ticketChannelId,
    staffDiscordUserId: input.staffDiscordUserId,
    customerDiscordUserId: input.customerDiscordUserId,
    productId: null,
    variantId: null,
    answers: {},
    expiresAt: Date.now() + DRAFT_TTL_MS,
  };

  draftStore.set(draft.id, draft);
  return draft;
}

export function getSaleDraft(draftId: string): SaleDraft | null {
  const draft = draftStore.get(draftId);
  if (!draft) {
    return null;
  }

  if (draft.expiresAt < Date.now()) {
    draftStore.delete(draftId);
    return null;
  }

  return draft;
}

export function updateSaleDraft(draft: SaleDraft): void {
  draftStore.set(draft.id, {
    ...draft,
    expiresAt: Date.now() + DRAFT_TTL_MS,
  });
}

export function removeSaleDraft(draftId: string): void {
  draftStore.delete(draftId);
}
