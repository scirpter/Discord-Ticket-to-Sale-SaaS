import { describe, expect, it } from 'vitest';

import { buildVoodooDeliveryId, resolveVoodooPaymentState } from '../src/services/webhook-service.js';

describe('voodoo payment state', () => {
  it('treats positive value_coin as paid signal', () => {
    const state = resolveVoodooPaymentState({
      value_coin: '6.99',
      coin: 'USDT',
    });

    expect(state.paid).toBe(true);
  });

  it('treats numeric confirmations as paid signal', () => {
    const state = resolveVoodooPaymentState({
      confirmations: '2',
    });

    expect(state.paid).toBe(true);
  });

  it('keeps failed status as not paid even with amount', () => {
    const state = resolveVoodooPaymentState({
      status: 'failed',
      value_coin: '6.99',
    });

    expect(state.paid).toBe(false);
    expect(state.status).toBe('failed');
  });

  it('includes value_coin in delivery id fingerprint', () => {
    const idA = buildVoodooDeliveryId('01HKTESTORDERSESSION0000000001', {
      order_session_id: '01HKTESTORDERSESSION0000000001',
      value_coin: '6.99',
    });

    const idB = buildVoodooDeliveryId('01HKTESTORDERSESSION0000000001', {
      order_session_id: '01HKTESTORDERSESSION0000000001',
      value_coin: '7.99',
    });

    expect(idA).not.toBe(idB);
  });
});
