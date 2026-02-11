import crypto from 'node:crypto';

import { AppError } from '../domain/errors.js';
import type { CheckoutTokenPayload } from '../domain/types.js';

function encodePayload(payload: CheckoutTokenPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodePayload(encoded: string): CheckoutTokenPayload {
  const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
  return JSON.parse(decoded) as CheckoutTokenPayload;
}

function createSignature(encodedPayload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

export function signCheckoutToken(payload: CheckoutTokenPayload, secret: string): string {
  const encoded = encodePayload(payload);
  const signature = createSignature(encoded, secret);
  return `${encoded}.${signature}`;
}

export function verifyCheckoutToken(token: string, secret: string): CheckoutTokenPayload {
  const [encodedPayload, receivedSignature] = token.split('.');
  if (!encodedPayload || !receivedSignature) {
    throw new AppError('INVALID_CHECKOUT_TOKEN', 'Malformed checkout token', 400);
  }

  const expectedSignature = createSignature(encodedPayload, secret);
  if (expectedSignature !== receivedSignature) {
    throw new AppError('INVALID_CHECKOUT_TOKEN_SIGNATURE', 'Invalid checkout token signature', 401);
  }

  const payload = decodePayload(encodedPayload);
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new AppError('EXPIRED_CHECKOUT_TOKEN', 'Checkout token expired', 401);
  }

  return payload;
}
