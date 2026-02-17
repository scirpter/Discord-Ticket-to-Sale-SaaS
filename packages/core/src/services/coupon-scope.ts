export type CouponScopeConfig = {
  allowedProductIds: string[];
  allowedVariantIds: string[];
};

export type CouponScopeLine = {
  productId: string;
  variantId: string;
  priceMinor: number;
};

function toNonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

export function isCouponApplicableToLine(
  scope: CouponScopeConfig,
  line: { productId: string; variantId: string },
): boolean {
  const productIds = new Set(scope.allowedProductIds);
  const variantIds = new Set(scope.allowedVariantIds);
  const productEligible = productIds.size === 0 || productIds.has(line.productId);
  const variantEligible = variantIds.size === 0 || variantIds.has(line.variantId);

  return productEligible && variantEligible;
}

export function computeCouponEligibleSubtotalMinor(
  scope: CouponScopeConfig,
  lines: CouponScopeLine[],
): number {
  let subtotal = 0;
  for (const line of lines) {
    if (!isCouponApplicableToLine(scope, line)) {
      continue;
    }

    subtotal += toNonNegativeInt(line.priceMinor);
  }

  return subtotal;
}
