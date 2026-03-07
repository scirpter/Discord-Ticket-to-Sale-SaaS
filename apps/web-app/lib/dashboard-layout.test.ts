import { describe, expect, it } from 'vitest';

import { getDashboardFocusForTutorialStep } from './dashboard-layout';

describe('getDashboardFocusForTutorialStep', () => {
  it('maps setup steps to the workspace panel', () => {
    expect(getDashboardFocusForTutorialStep('workspace-select')).toEqual({
      dashboard: 'workspace',
    });
    expect(getDashboardFocusForTutorialStep('context-preview')).toEqual({
      dashboard: 'workspace',
    });
  });

  it('maps sales configuration steps to the sales panel', () => {
    expect(getDashboardFocusForTutorialStep('paid-log-channel')).toEqual({
      dashboard: 'sales',
    });
    expect(getDashboardFocusForTutorialStep('points-adjust-email')).toEqual({
      dashboard: 'sales',
    });
  });

  it('maps payment and coupon steps to their panels', () => {
    expect(getDashboardFocusForTutorialStep('wallet-address')).toEqual({
      dashboard: 'payments',
    });
    expect(getDashboardFocusForTutorialStep('coupon-variant-scope')).toEqual({
      dashboard: 'coupons',
    });
  });

  it('maps catalog steps to the right nested catalog sections', () => {
    expect(getDashboardFocusForTutorialStep('products-refresh')).toEqual({
      dashboard: 'catalog',
      catalog: 'overview',
    });
    expect(getDashboardFocusForTutorialStep('question-label')).toEqual({
      dashboard: 'catalog',
      catalog: 'category',
    });
    expect(getDashboardFocusForTutorialStep('product-name')).toEqual({
      dashboard: 'catalog',
      catalog: 'product',
    });
    expect(getDashboardFocusForTutorialStep('variant-price')).toEqual({
      dashboard: 'catalog',
      catalog: 'pricing',
    });
  });

  it('maps admin and fallback steps correctly', () => {
    expect(getDashboardFocusForTutorialStep('super-admin-list-users')).toEqual({
      dashboard: 'super-admin',
    });
    expect(getDashboardFocusForTutorialStep('latest-action')).toEqual({
      dashboard: 'latest-action',
    });
    expect(getDashboardFocusForTutorialStep('unknown-step')).toEqual({
      dashboard: 'workspace',
    });
  });
});
