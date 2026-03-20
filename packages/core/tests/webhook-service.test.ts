import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok } from 'neverthrow';

import type { OrderSessionRecord } from '../src/repositories/order-repository.js';
import type { ReferralRewardResult } from '../src/services/referral-service.js';
import { WebhookService } from '../src/services/webhook-service.js';

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
    customerEmailNormalized: 'customer@example.com',
    pointsReserved: 0,
    pointsDiscountMinor: 0,
    pointsReservationState: 'consumed',
    pointsConfigSnapshot: {
      pointValueMinor: 100,
      earnCategoryKeys: [],
      redeemCategoryKeys: [],
    },
    referralRewardMinorSnapshot: 0,
    tipMinor: 0,
    subtotalMinor: 1000,
    totalMinor: 1000,
    status: 'pending_payment',
    answers: {
      email: 'customer@example.com',
    },
    checkoutUrl: null,
    checkoutUrlCrypto: null,
    checkoutTokenExpiresAt: new Date(),
    ...overrides,
  };
}

describe('webhook service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('continues Discord delivery when the paid order record already exists', async () => {
    const service = new WebhookService();
    const orderSession = makeOrderSession();
    const referralResult: ReferralRewardResult = {
      status: 'not_applicable',
      reason: 'no_claim',
      referredEmailNormalized: orderSession.customerEmailNormalized,
      claim: null,
      rewardMinor: 0,
      pointValueMinor: 100,
      rewardPoints: 0,
    };

    vi.spyOn((service as any).orderRepository, 'getOrderSession').mockResolvedValue(orderSession);
    vi.spyOn((service as any).productRepository, 'getById').mockResolvedValue({
      id: orderSession.productId,
      category: 'Football',
      name: 'Match Package',
      variants: [
        {
          id: orderSession.variantId,
          label: 'Standard',
          priceMinor: 1000,
          currency: 'GBP',
        },
      ],
    });
    vi.spyOn((service as any).orderRepository, 'createPaidOrder').mockResolvedValue({
      paidOrderId: 'paid-order-1',
      created: false,
    });
    vi.spyOn((service as any).orderRepository, 'markOrderSessionPaid').mockResolvedValue(undefined);
    vi.spyOn((service as any).tenantRepository, 'getGuildConfig').mockResolvedValue({
      paidLogChannelId: 'paid-log-channel',
      referralLogChannelId: null,
      referralThankYouTemplate: null,
    });
    const finalizePointsForPaidOrder = vi
      .spyOn(service as any, 'finalizePointsForPaidOrder')
      .mockResolvedValue({
        updatedPointsBalance: 42,
        referralResult,
      });
    vi.spyOn(service as any, 'fetchWooNotes').mockResolvedValue({
      latestInternal: null,
      latestCustomer: null,
    });
    vi.spyOn((service as any).orderRepository, 'cacheOrderNotes').mockResolvedValue(undefined);
    vi.spyOn((service as any).productRepository, 'getSensitiveFieldKeys').mockResolvedValue(new Set<string>());
    vi.spyOn(service as any, 'getBotTokenCandidates').mockResolvedValue(ok(['bot-token']));
    const postPaidLogMessage = vi.spyOn(service as any, 'postPaidLogMessage').mockResolvedValue(undefined);
    const postTicketPaidConfirmation = vi
      .spyOn(service as any, 'postTicketPaidConfirmation')
      .mockResolvedValue(undefined);
    const postReferralOutcome = vi.spyOn(service as any, 'postReferralOutcome').mockResolvedValue(undefined);
    const markWebhookProcessed = vi
      .spyOn((service as any).orderRepository, 'markWebhookProcessed')
      .mockResolvedValue(undefined);
    const markWebhookDuplicate = vi
      .spyOn((service as any).orderRepository, 'markWebhookDuplicate')
      .mockResolvedValue(undefined);

    await (service as any).processWooPaidEvent({
      integration: {
        tenantId: orderSession.tenantId,
        guildId: orderSession.guildId,
        wpBaseUrl: 'https://shop.example.com',
        consumerKey: 'ck_test',
        consumerSecret: 'cs_test',
      },
      payload: {
        id: 123,
        status: 'completed',
        number: '1001',
        total: '10.00',
        currency: 'GBP',
        meta_data: [
          {
            key: 'vd_order_session_id',
            value: orderSession.id,
          },
        ],
      },
      webhookEventId: 'webhook-1',
    });

    expect(finalizePointsForPaidOrder).toHaveBeenCalledOnce();
    expect(postPaidLogMessage).toHaveBeenCalledOnce();
    expect(postTicketPaidConfirmation).toHaveBeenCalledOnce();
    expect(postReferralOutcome).toHaveBeenCalledOnce();
    expect(markWebhookProcessed).toHaveBeenCalledWith('webhook-1');
    expect(markWebhookDuplicate).not.toHaveBeenCalled();
  });
});
