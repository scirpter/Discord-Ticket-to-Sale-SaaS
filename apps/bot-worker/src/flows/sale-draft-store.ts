import crypto from 'node:crypto';

export type SaleDraftVariantOption = {
  variantId: string;
  label: string;
  priceMinor: number;
  currency: string;
};

export type SaleDraftBasketItem = {
  productId: string;
  productName: string;
  category: string;
  variantId: string;
  variantLabel: string;
  priceMinor: number;
  currency: string;
};

export type SaleDraftFormField = {
  fieldKey: string;
  label: string;
  required: boolean;
  fieldType: 'short_text' | 'long_text' | 'email' | 'number';
  validation: Record<string, unknown> | null;
};

export type SaleDraft = {
  id: string;
  tenantId: string;
  guildId: string;
  ticketChannelId: string;
  staffDiscordUserId: string;
  customerDiscordUserId: string;
  category: string | null;
  productName: string | null;
  productId: string | null;
  variantId: string | null;
  variantOptions: SaleDraftVariantOption[];
  basketItems: SaleDraftBasketItem[];
  couponCode: string | null;
  tipMinor: number;
  tipEnabled: boolean;
  defaultCurrency: string;
  formFields: SaleDraftFormField[];
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
  tipEnabled?: boolean;
  defaultCurrency?: string;
}): SaleDraft {
  const draft: SaleDraft = {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    guildId: input.guildId,
    ticketChannelId: input.ticketChannelId,
    staffDiscordUserId: input.staffDiscordUserId,
    customerDiscordUserId: input.customerDiscordUserId,
    category: null,
    productName: null,
    productId: null,
    variantId: null,
    variantOptions: [],
    basketItems: [],
    couponCode: null,
    tipMinor: 0,
    tipEnabled: input.tipEnabled ?? false,
    defaultCurrency: input.defaultCurrency ?? 'GBP',
    formFields: [],
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
