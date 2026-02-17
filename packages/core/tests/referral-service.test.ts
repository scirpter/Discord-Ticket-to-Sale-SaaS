import { describe, expect, it } from 'vitest';

import type { OrderSessionRecord } from '../src/repositories/order-repository.js';
import { ReferralService } from '../src/services/referral-service.js';

function makeOrderSession(overrides: Partial<OrderSessionRecord> = {}): OrderSessionRecord {
  return {
    id: '01HKTESORDERSESSION0000000001',
    tenantId: '01HKTENANT0000000000000001',
    guildId: '123456789012345678',
    ticketChannelId: '223456789012345678',
    staffUserId: '323456789012345678',
    customerDiscordId: '423456789012345678',
    productId: '01HKPRODUCT000000000000001',
    variantId: '01HKVARIANT000000000000001',
    basketItems: [],
    couponCode: null,
    couponDiscountMinor: 0,
    customerEmailNormalized: null,
    pointsReserved: 0,
    pointsDiscountMinor: 0,
    pointsReservationState: 'none',
    pointsConfigSnapshot: {
      pointValueMinor: 100,
      earnCategoryKeys: [],
      redeemCategoryKeys: [],
    },
    referralRewardMinorSnapshot: 0,
    tipMinor: 0,
    subtotalMinor: 0,
    totalMinor: 0,
    status: 'paid',
    answers: {},
    checkoutUrl: null,
    checkoutTokenExpiresAt: new Date(),
    ...overrides,
  };
}

describe('referral service', () => {
  it('renders thank-you template placeholders', () => {
    const service = new ReferralService();

    const rendered = service.renderThankYouTemplate({
      template:
        'Congrats {referrer_email}! +{points} points (£{amount_gbp}) for {referred_email} on {order_session_id}.',
      rewardPoints: 10,
      rewardMinor: 1000,
      referredEmail: 'new@example.com',
      referrerEmail: 'ref@example.com',
      orderSessionId: '01HKTESORDERSESSION0000000001',
    });

    expect(rendered).toContain('ref@example.com');
    expect(rendered).toContain('+10 points');
    expect(rendered).toContain('£10.00');
    expect(rendered).toContain('new@example.com');
    expect(rendered).toContain('01HKTESORDERSESSION0000000001');
  });

  it('blocks self-referral when creating claim', async () => {
    const service = new ReferralService();

    const created = await service.createClaimFromCommand({
      tenantId: '01HKTENANT0000000000000001',
      guildId: '123456789012345678',
      referrerDiscordUserId: '523456789012345678',
      referrerEmail: 'same@example.com',
      referredEmail: 'same@example.com',
    });

    expect(created.isOk()).toBe(true);
    if (created.isErr()) {
      return;
    }
    expect(created.value.status).toBe('self_blocked');
  });

  it('returns no_customer_email outcome without DB side effects', async () => {
    const service = new ReferralService();

    const result = await service.processPaidOrderReward({
      orderSession: makeOrderSession({
        customerEmailNormalized: null,
      }),
      referralThankYouTemplate: null,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }

    expect(result.value.status).toBe('not_applicable');
    if (result.value.status !== 'not_applicable') {
      return;
    }
    expect(result.value.reason).toBe('no_customer_email');
  });
});
