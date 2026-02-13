type CheckoutLinkRecord = {
  orderSessionId: string;
  checkoutUrl: string;
  expiresAt: number;
};

const CHECKOUT_LINK_TTL_MS = 24 * 60 * 60 * 1000;
const checkoutLinkStore = new Map<string, CheckoutLinkRecord>();

export function rememberCheckoutLink(input: {
  orderSessionId: string;
  checkoutUrl: string;
  ttlMs?: number;
}): void {
  const ttlMs = input.ttlMs && input.ttlMs > 0 ? input.ttlMs : CHECKOUT_LINK_TTL_MS;
  checkoutLinkStore.set(input.orderSessionId, {
    orderSessionId: input.orderSessionId,
    checkoutUrl: input.checkoutUrl,
    expiresAt: Date.now() + ttlMs,
  });
}

export function getCheckoutLink(orderSessionId: string): string | null {
  const entry = checkoutLinkStore.get(orderSessionId);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt < Date.now()) {
    checkoutLinkStore.delete(orderSessionId);
    return null;
  }

  return entry.checkoutUrl;
}

