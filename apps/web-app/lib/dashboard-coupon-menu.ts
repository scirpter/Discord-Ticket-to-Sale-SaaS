export type CouponPanelId = 'settings' | 'create-coupon' | 'saved-coupons';

type CouponMenuItem = {
  id: CouponPanelId;
  label: string;
  description: string;
  info: string;
};

const couponSettingsItem: CouponMenuItem = {
  id: 'settings',
  label: 'Coupon Settings',
  description: 'Enable or disable coupons for this Discord server.',
  info: 'When coupons are disabled, checkout and admin flows reject coupon usage and the create/manage views stay hidden.',
};

const couponEnabledMenuItems = [
  couponSettingsItem,
  {
    id: 'create-coupon',
    label: 'Create Coupon',
    description: 'Choose the code, discount, and scope for a new or edited coupon.',
    info: 'Coupons can stay global or be narrowed to categories, specific products, and individual variations.',
  },
  {
    id: 'saved-coupons',
    label: 'View Coupons',
    description: 'Review existing coupons and open one for editing or deletion.',
    info: 'Delete actions stay in the saved list so management remains obvious and separate from the create screen.',
  },
] as const satisfies readonly CouponMenuItem[];

const couponDisabledMenuItems = [couponSettingsItem] as const satisfies readonly CouponMenuItem[];

export function getCouponMenuItems(enabled: boolean): readonly CouponMenuItem[] {
  return enabled ? couponEnabledMenuItems : couponDisabledMenuItems;
}
