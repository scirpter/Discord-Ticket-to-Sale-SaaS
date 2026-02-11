import crypto from 'node:crypto';

import { AppError } from '../domain/errors.js';

export type SessionPayload = {
  userId: string;
  discordUserId: string;
  isSuperAdmin: boolean;
  tenantIds: string[];
  exp: number;
};

function encode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function decode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

export function createSessionToken(payload: SessionPayload, secret: string): string {
  const encodedPayload = encode(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string, secret: string): SessionPayload {
  const [encodedPayload, signature] = token.split('.');

  if (!encodedPayload || !signature) {
    throw new AppError('INVALID_SESSION', 'Malformed session token', 401);
  }

  const expected = sign(encodedPayload, secret);
  if (expected !== signature) {
    throw new AppError('INVALID_SESSION', 'Session token signature mismatch', 401);
  }

  const payload = JSON.parse(decode(encodedPayload)) as SessionPayload;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new AppError('SESSION_EXPIRED', 'Session expired', 401);
  }

  return payload;
}
