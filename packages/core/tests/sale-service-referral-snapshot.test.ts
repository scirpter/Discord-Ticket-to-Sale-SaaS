import { describe, expect, it } from 'vitest';

import { calculateReferralRewardMinorSnapshot } from '../src/services/sale-service.js';

describe('calculateReferralRewardMinorSnapshot', () => {
  it('sums variant rewards for eligible categories', () => {
    const snapshot = calculateReferralRewardMinorSnapshot({
      items: [
        { category: 'Accounts', variantReferralRewardMinor: 1000 },
        { category: 'Boosting', variantReferralRewardMinor: 2500 },
      ],
      referralRewardCategoryKeys: ['boosting'],
      fallbackReferralRewardMinor: 500,
    });

    expect(snapshot).toBe(2500);
  });

  it('returns zero when no purchased item category is eligible', () => {
    const snapshot = calculateReferralRewardMinorSnapshot({
      items: [{ category: 'Accounts', variantReferralRewardMinor: 1500 }],
      referralRewardCategoryKeys: ['nitro'],
      fallbackReferralRewardMinor: 1000,
    });

    expect(snapshot).toBe(0);
  });

  it('uses fallback reward when eligible variants have no explicit reward', () => {
    const snapshot = calculateReferralRewardMinorSnapshot({
      items: [{ category: 'Accounts', variantReferralRewardMinor: 0 }],
      referralRewardCategoryKeys: ['accounts'],
      fallbackReferralRewardMinor: 1200,
    });

    expect(snapshot).toBe(1200);
  });

  it('treats all categories as eligible when no category filter is configured', () => {
    const snapshot = calculateReferralRewardMinorSnapshot({
      items: [{ category: 'Accounts', variantReferralRewardMinor: 900 }],
      referralRewardCategoryKeys: [],
      fallbackReferralRewardMinor: 0,
    });

    expect(snapshot).toBe(900);
  });
});
