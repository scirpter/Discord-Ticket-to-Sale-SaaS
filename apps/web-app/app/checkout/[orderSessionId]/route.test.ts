import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getOrderSessionById } = vi.hoisted(() => ({
  getOrderSessionById: vi.fn(),
}));

vi.mock('@voodoo/core', () => {
  class AppError extends Error {
    public readonly code: string;
    public readonly statusCode: number;

    public constructor(code: string, message: string, statusCode: number) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  }

  return {
    AppError,
    OrderRepository: class {
      public getOrderSessionById = getOrderSessionById;
    },
  };
});

import { GET } from './route';

describe('checkout redirect route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a single redirect to the standard checkout URL', async () => {
    getOrderSessionById.mockResolvedValue({
      checkoutTokenExpiresAt: new Date(Date.now() + 60_000),
      status: 'pending_payment',
      checkoutUrl: 'https://checkout.voodoo-pay.uk/pay.php?vd_token=pay-token',
      checkoutUrlCrypto: 'https://checkout.voodoo-pay.uk/crypto/hosted.php?payment_token=crypto-token',
    });

    const response = await GET(new NextRequest('https://voodoopaybot.online/checkout/01ABC'), {
      params: Promise.resolve({ orderSessionId: '01ABC' }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://checkout.voodoo-pay.uk/pay.php?vd_token=pay-token');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('returns a single redirect to the crypto checkout URL when requested', async () => {
    getOrderSessionById.mockResolvedValue({
      checkoutTokenExpiresAt: new Date(Date.now() + 60_000),
      status: 'pending_payment',
      checkoutUrl: 'https://checkout.voodoo-pay.uk/pay.php?vd_token=pay-token',
      checkoutUrlCrypto: 'https://checkout.voodoo-pay.uk/crypto/hosted.php?payment_token=crypto-token',
    });

    const response = await GET(new NextRequest('https://voodoopaybot.online/checkout/01ABC?method=crypto'), {
      params: Promise.resolve({ orderSessionId: '01ABC' }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://checkout.voodoo-pay.uk/crypto/hosted.php?payment_token=crypto-token',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
