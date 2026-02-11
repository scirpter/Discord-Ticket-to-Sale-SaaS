import { describe, expect, it } from 'vitest';

import {
  createWooWebhookSignature,
  isPaidWooStatus,
  verifyWooWebhookSignature,
} from '../src/security/webhook-signature.js';

describe('webhook signature', () => {
  it('verifies valid signature', () => {
    const body = JSON.stringify({ order: { id: 1 } });
    const secret = 'woo-secret';
    const signature = createWooWebhookSignature(body, secret);

    const valid = verifyWooWebhookSignature({
      rawBody: body,
      secret,
      providedSignature: signature,
    });

    expect(valid).toBe(true);
  });

  it('rejects invalid signature', () => {
    const valid = verifyWooWebhookSignature({
      rawBody: '{"a":1}',
      secret: 'woo-secret',
      providedSignature: 'invalid',
    });

    expect(valid).toBe(false);
  });

  it('accepts only processing/completed as paid', () => {
    expect(isPaidWooStatus('processing')).toBe(true);
    expect(isPaidWooStatus('completed')).toBe(true);
    expect(isPaidWooStatus('pending')).toBe(false);
    expect(isPaidWooStatus('failed')).toBe(false);
  });
});
