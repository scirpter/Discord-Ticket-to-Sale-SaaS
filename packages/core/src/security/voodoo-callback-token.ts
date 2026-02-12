import { createHmac, timingSafeEqual } from 'node:crypto';

type VoodooCallbackTokenPayload = {
  tenantId: string;
  guildId: string;
  orderSessionId: string;
};

function serializePayload(payload: VoodooCallbackTokenPayload): string {
  return `${payload.tenantId}:${payload.guildId}:${payload.orderSessionId}`;
}

export function signVoodooCallbackToken(
  payload: VoodooCallbackTokenPayload,
  secret: string,
): string {
  return createHmac('sha256', secret).update(serializePayload(payload)).digest('hex');
}

export function verifyVoodooCallbackToken(input: {
  payload: VoodooCallbackTokenPayload;
  secret: string;
  providedToken: string | null | undefined;
}): boolean {
  if (!input.providedToken) {
    return false;
  }

  const expectedToken = signVoodooCallbackToken(input.payload, input.secret);
  const expectedBuffer = Buffer.from(expectedToken);
  const providedBuffer = Buffer.from(input.providedToken);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}
