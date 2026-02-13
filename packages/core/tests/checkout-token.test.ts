import { describe, expect, it } from 'vitest';

import { signCheckoutToken, verifyCheckoutToken } from '../src/security/checkout-token.js';

describe('checkout token', () => {
  it('signs and verifies token payload', () => {
    const token = signCheckoutToken(
      {
        orderSessionId: '01K123',
        exp: Math.floor(Date.now() / 1000) + 60,
      },
      'secret-key',
    );

    const payload = verifyCheckoutToken(token, 'secret-key');
    expect(payload.orderSessionId).toBe('01K123');
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects expired token', () => {
    const token = signCheckoutToken(
      {
        orderSessionId: '01K123',
        exp: Math.floor(Date.now() / 1000) - 1,
      },
      'secret-key',
    );

    expect(() => verifyCheckoutToken(token, 'secret-key')).toThrowError('Checkout token expired');
  });
});
