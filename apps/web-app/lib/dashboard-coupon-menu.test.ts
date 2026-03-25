import { describe, expect, it } from 'vitest';

import { getCouponMenuItems } from './dashboard-coupon-menu';

describe('getCouponMenuItems', () => {
  it('shows only settings when coupons are disabled', () => {
    expect(getCouponMenuItems(false).map((item) => item.id)).toEqual(['settings']);
  });

  it('shows settings, create, and saved views when coupons are enabled', () => {
    expect(getCouponMenuItems(true).map((item) => item.id)).toEqual([
      'settings',
      'create-coupon',
      'saved-coupons',
    ]);
  });
});
