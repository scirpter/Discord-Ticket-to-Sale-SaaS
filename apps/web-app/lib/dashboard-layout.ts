import type { CatalogSectionId, DashboardSectionId } from './dashboard-panels';

export type DashboardFocusTarget = {
  dashboard: DashboardSectionId;
  catalog?: CatalogSectionId;
};

const workspaceStepIds = new Set([
  'welcome',
  'workspace-select',
  'discord-server-select',
  'workspace-create-toggle',
  'workspace-name',
  'workspace-delete',
  'bot-install-status',
  'context-preview',
  'run-tutorial-button',
]);

const salesStepIds = new Set([
  'paid-log-channel',
  'staff-roles',
  'tip-enabled',
  'point-value',
  'referral-reward',
  'referral-categories',
  'referral-log-channel',
  'referral-submission-template',
  'referral-thank-you-template',
  'points-earn-categories',
  'points-redeem-categories',
  'customer-points-search',
  'points-adjust-email',
  'points-adjust-value',
  'save-server-settings',
]);

const paymentStepIds = new Set([
  'wallet-address',
  'checkout-domain',
  'callback-secret',
  'save-voodoo',
  'voodoo-webhook',
]);

const couponStepIds = new Set([
  'coupons-refresh',
  'coupon-code',
  'coupon-discount',
  'coupon-active',
  'coupon-product-scope',
  'coupon-variant-scope',
  'save-coupon',
]);

const catalogOverviewStepIds = new Set(['products-refresh']);
const categoryStepIds = new Set([
  'category-builder-existing',
  'category-builder-name',
  'category-rename-to',
  'question-list',
  'question-key',
  'question-label',
  'question-type',
  'question-required',
  'question-sensitive',
  'save-category-questions',
]);
const productStepIds = new Set([
  'product-category',
  'product-name',
  'product-description',
  'product-active',
  'save-product',
]);
const pricingStepIds = new Set([
  'variant-label',
  'variant-price',
  'variant-referral-reward',
]);

const superAdminStepIds = new Set([
  'super-admin-card',
  'global-bot-token',
  'super-admin-list-tenants',
  'super-admin-list-users',
]);

export function getDashboardFocusForTutorialStep(stepId: string): DashboardFocusTarget {
  if (workspaceStepIds.has(stepId)) {
    return { dashboard: 'workspace' };
  }

  if (salesStepIds.has(stepId)) {
    return { dashboard: 'sales' };
  }

  if (paymentStepIds.has(stepId)) {
    return { dashboard: 'payments' };
  }

  if (couponStepIds.has(stepId)) {
    return { dashboard: 'coupons' };
  }

  if (catalogOverviewStepIds.has(stepId)) {
    return { dashboard: 'catalog', catalog: 'overview' };
  }

  if (categoryStepIds.has(stepId)) {
    return { dashboard: 'catalog', catalog: 'category' };
  }

  if (productStepIds.has(stepId)) {
    return { dashboard: 'catalog', catalog: 'product' };
  }

  if (pricingStepIds.has(stepId)) {
    return { dashboard: 'catalog', catalog: 'pricing' };
  }

  if (superAdminStepIds.has(stepId)) {
    return { dashboard: 'super-admin' };
  }

  if (stepId === 'latest-action') {
    return { dashboard: 'latest-action' };
  }

  return { dashboard: 'workspace' };
}
