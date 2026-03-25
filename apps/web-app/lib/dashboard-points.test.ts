import { describe, expect, it } from 'vitest';

import {
  shouldLoadCustomerPoints,
  shouldShowCustomerPointsLoading,
} from './dashboard-points';

describe('dashboard points helpers', () => {
  it('loads customer balances only when points are enabled and the customer panel is active', () => {
    expect(
      shouldLoadCustomerPoints({
        pointsEnabled: true,
        activePanel: 'customer-points',
      }),
    ).toBe(true);

    expect(
      shouldLoadCustomerPoints({
        pointsEnabled: false,
        activePanel: 'customer-points',
      }),
    ).toBe(false);

    expect(
      shouldLoadCustomerPoints({
        pointsEnabled: true,
        activePanel: 'reward-settings',
      }),
    ).toBe(false);
  });

  it('shows the customer loader only for the empty-state load', () => {
    expect(
      shouldShowCustomerPointsLoading({
        loadingCustomers: true,
        customerCount: 0,
      }),
    ).toBe(true);

    expect(
      shouldShowCustomerPointsLoading({
        loadingCustomers: true,
        customerCount: 3,
      }),
    ).toBe(false);

    expect(
      shouldShowCustomerPointsLoading({
        loadingCustomers: false,
        customerCount: 0,
      }),
    ).toBe(false);
  });
});
