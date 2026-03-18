import { describe, expect, it } from 'vitest';

import {
  buildTelegramCheckoutButtonLabel,
  buildTelegramCheckoutCopyPayloads,
} from './checkout-links.js';

describe('telegram checkout links', () => {
  it('uses a clear single-button label for one checkout option', () => {
    expect(
      buildTelegramCheckoutButtonLabel({
        label: 'Pay',
        index: 0,
        total: 1,
      }),
    ).toBe('Open Checkout');
  });

  it('keeps explicit labels when multiple checkout options exist', () => {
    expect(
      buildTelegramCheckoutButtonLabel({
        label: 'Pay with Crypto',
        index: 1,
        total: 2,
      }),
    ).toBe('Pay with Crypto');
  });

  it('uses a normal Telegram message when the raw checkout URL fits safely', () => {
    expect(
      buildTelegramCheckoutCopyPayloads([
        {
          method: 'pay',
          label: 'Pay',
          url: 'https://checkout.voodoo-pay.uk/pay.php?vd_token=abc123',
        },
      ]),
    ).toEqual([
      {
        kind: 'message',
        label: 'Pay',
        text: [
          'Pay raw checkout link:',
          'https://checkout.voodoo-pay.uk/pay.php?vd_token=abc123',
          '',
          'If Telegram breaks checkout, copy this exact link into Chrome or Safari.',
        ].join('\n'),
      },
    ]);
  });

  it('falls back to a text file when the raw checkout URL is too long for a safe Telegram message', () => {
    const longUrl = `https://checkout.voodoo-pay.uk/crypto/hosted.php?payment_token=${'x'.repeat(5000)}`;

    expect(
      buildTelegramCheckoutCopyPayloads([
        {
          method: 'crypto',
          label: 'Pay with Crypto',
          url: longUrl,
        },
      ]),
    ).toEqual([
      {
        kind: 'file',
        label: 'Pay with Crypto',
        text: `${longUrl}\n`,
        fileName: 'pay-with-crypto-checkout-link.txt',
        caption:
          'Pay with Crypto raw checkout link. Open the file, copy the exact URL, and paste it into Chrome or Safari if Telegram breaks checkout.',
      },
    ]);
  });
});
