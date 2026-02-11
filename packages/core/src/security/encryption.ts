import crypto from 'node:crypto';

import { AppError } from '../domain/errors.js';

function normalizeKey(rawKey: string): Buffer {
  const maybeBase64 = rawKey.replace(/\s+/g, '');
  try {
    const decoded = Buffer.from(maybeBase64, 'base64');
    if (decoded.length >= 32) {
      return decoded.subarray(0, 32);
    }
  } catch {
    // Fall back to sha256 below.
  }

  return crypto.createHash('sha256').update(rawKey, 'utf8').digest();
}

export function encryptSecret(plaintext: string, rawKey: string): string {
  const key = normalizeKey(rawKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function decryptSecret(ciphertext: string, rawKey: string): string {
  const key = normalizeKey(rawKey);
  const payload = Buffer.from(ciphertext, 'base64url');

  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);

  if (iv.length !== 12 || tag.length !== 16) {
    throw new AppError('INVALID_SECRET_PAYLOAD', 'Invalid secret payload', 400);
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
