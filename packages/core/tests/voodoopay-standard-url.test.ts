import { describe, expect, it } from 'vitest';

import { buildVoodooPayHostedCheckoutUrl } from '../src/services/sale-service.js';

describe('buildVoodooPayHostedCheckoutUrl', () => {
  it('preserves provider-issued percent encoding for standard checkout values', () => {
    const url = buildVoodooPayHostedCheckoutUrl({
      checkoutBaseUrl: 'https://checkout.voodoo-pay.uk',
      address: 'wallet%2Faddress%3Dabc123',
      amount: '12.34',
      currency: 'GBP',
      checkoutDomain: 'checkout.voodoo-pay.uk',
      vdToken: 'checkout-token',
      orderSessionId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      email: 'customer+telegram@example.com',
      ipnToken: 'ipn%2Ftoken%3Dxyz789',
    });

    expect(url).toBe(
      'https://checkout.voodoo-pay.uk/pay.php?address=wallet%2Faddress%3Dabc123&amount=12.34&currency=GBP&domain=checkout.voodoo-pay.uk&vd_token=checkout-token&vd_order_session_id=01ARZ3NDEKTSV4RRFFQ69G5FAV&email=customer%2Btelegram%40example.com&ipn_token=ipn%2Ftoken%3Dxyz789',
    );
    expect(url).not.toContain('%252F');
    expect(url).not.toContain('%253D');
  });
});
