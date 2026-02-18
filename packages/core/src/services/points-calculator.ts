export type PointsCalcLineInput = {
  category: string;
  priceMinor: number;
};

export type PointsCalcLineBreakdown = {
  categoryKey: string;
  priceMinor: number;
  couponAllocatedMinor: number;
  lineAfterCouponMinor: number;
  pointsAllocatedMinor: number;
  lineNetMinor: number;
};

export type PointsOrderCalculation = {
  subtotalMinor: number;
  couponDiscountMinor: number;
  redeemablePoolMinor: number;
  maxRedeemablePointsByAmount: number;
  pointsReserved: number;
  pointsDiscountMinor: number;
  tipMinor: number;
  totalMinor: number;
  earnPoolMinor: number;
  pointsEarned: number;
  lineBreakdown: PointsCalcLineBreakdown[];
};

const MINOR_PER_MAJOR = 100;

function toNonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function calculateEarnedPointsFromMinor(earnPoolMinor: number): number {
  return Math.floor(toNonNegativeInt(earnPoolMinor) / MINOR_PER_MAJOR);
}

export function normalizeCategoryKey(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeCategoryKeyList(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const key = normalizeCategoryKey(value);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(key);
  }

  return output;
}

export function allocateProportionalMinor(
  totalMinor: number,
  amountsMinor: number[],
  eligibleMask?: boolean[],
): number[] {
  const normalizedTotal = toNonNegativeInt(totalMinor);
  if (normalizedTotal <= 0 || amountsMinor.length === 0) {
    return amountsMinor.map(() => 0);
  }

  const normalizedAmounts = amountsMinor.map((amount) => toNonNegativeInt(amount));
  const eligibleIndices: number[] = [];
  for (let index = 0; index < normalizedAmounts.length; index += 1) {
    const amount = normalizedAmounts[index] ?? 0;
    const eligible = eligibleMask ? Boolean(eligibleMask[index]) : true;
    if (!eligible || amount <= 0) {
      continue;
    }
    eligibleIndices.push(index);
  }

  if (eligibleIndices.length === 0) {
    return normalizedAmounts.map(() => 0);
  }

  const eligibleTotal = eligibleIndices.reduce((sum, index) => sum + (normalizedAmounts[index] ?? 0), 0);
  if (eligibleTotal <= 0) {
    return normalizedAmounts.map(() => 0);
  }

  const cappedTotal = Math.min(normalizedTotal, eligibleTotal);
  const allocations = normalizedAmounts.map(() => 0);

  for (const index of eligibleIndices) {
    const amount = normalizedAmounts[index] ?? 0;
    allocations[index] = Math.floor((cappedTotal * amount) / eligibleTotal);
  }

  let remainder = cappedTotal - allocations.reduce((sum, value) => sum + value, 0);
  if (remainder <= 0) {
    return allocations;
  }

  for (const index of eligibleIndices) {
    if (remainder <= 0) {
      break;
    }

    const amount = normalizedAmounts[index] ?? 0;
    const allocation = allocations[index] ?? 0;
    if (allocation >= amount) {
      continue;
    }

    allocations[index] = allocation + 1;
    remainder -= 1;
  }

  return allocations;
}

function buildLineBreakdown(input: {
  lines: PointsCalcLineInput[];
  couponDiscountMinor: number;
  pointsDiscountMinor: number;
  redeemCategoryKeys: string[];
}): {
  lineBreakdown: PointsCalcLineBreakdown[];
  subtotalMinor: number;
  couponDiscountMinor: number;
  pointsDiscountMinor: number;
  redeemablePoolMinor: number;
} {
  const normalizedLines = input.lines.map((line) => ({
    categoryKey: normalizeCategoryKey(line.category),
    priceMinor: toNonNegativeInt(line.priceMinor),
  }));
  const subtotalMinor = normalizedLines.reduce((sum, line) => sum + line.priceMinor, 0);
  const couponDiscountMinor = Math.min(toNonNegativeInt(input.couponDiscountMinor), subtotalMinor);
  const couponAllocations = allocateProportionalMinor(
    couponDiscountMinor,
    normalizedLines.map((line) => line.priceMinor),
  );

  const linesAfterCoupon = normalizedLines.map((line, index) => {
    const couponAllocatedMinor = couponAllocations[index] ?? 0;
    const lineAfterCouponMinor = Math.max(0, line.priceMinor - couponAllocatedMinor);

    return {
      categoryKey: line.categoryKey,
      priceMinor: line.priceMinor,
      couponAllocatedMinor,
      lineAfterCouponMinor,
    };
  });

  const redeemSet = new Set(normalizeCategoryKeyList(input.redeemCategoryKeys));
  const redeemableMask = linesAfterCoupon.map((line) => redeemSet.has(line.categoryKey));
  const redeemablePoolMinor = linesAfterCoupon.reduce((sum, line, index) => {
    if (!redeemableMask[index]) {
      return sum;
    }

    return sum + line.lineAfterCouponMinor;
  }, 0);

  const pointsDiscountMinor = Math.min(toNonNegativeInt(input.pointsDiscountMinor), redeemablePoolMinor);
  const pointsAllocations = allocateProportionalMinor(
    pointsDiscountMinor,
    linesAfterCoupon.map((line) => line.lineAfterCouponMinor),
    redeemableMask,
  );

  const lineBreakdown: PointsCalcLineBreakdown[] = linesAfterCoupon.map((line, index) => {
    const pointsAllocatedMinor = pointsAllocations[index] ?? 0;
    return {
      categoryKey: line.categoryKey,
      priceMinor: line.priceMinor,
      couponAllocatedMinor: line.couponAllocatedMinor,
      lineAfterCouponMinor: line.lineAfterCouponMinor,
      pointsAllocatedMinor,
      lineNetMinor: Math.max(0, line.lineAfterCouponMinor - pointsAllocatedMinor),
    };
  });

  return {
    lineBreakdown,
    subtotalMinor,
    couponDiscountMinor,
    pointsDiscountMinor,
    redeemablePoolMinor,
  };
}

function calculateEarnPoolMinor(
  lineBreakdown: PointsCalcLineBreakdown[],
  earnCategoryKeys: string[],
): number {
  const earnSet = new Set(normalizeCategoryKeyList(earnCategoryKeys));
  if (earnSet.size === 0) {
    return 0;
  }

  return lineBreakdown.reduce((sum, line) => {
    if (!earnSet.has(line.categoryKey)) {
      return sum;
    }

    return sum + line.lineNetMinor;
  }, 0);
}

export function calculatePointsOrderTotals(input: {
  lines: PointsCalcLineInput[];
  couponDiscountMinor: number;
  tipMinor: number;
  pointValueMinor: number;
  earnCategoryKeys: string[];
  redeemCategoryKeys: string[];
  availablePoints: number;
  usePoints: boolean;
}): PointsOrderCalculation {
  const pointValueMinor = Math.max(1, toNonNegativeInt(input.pointValueMinor));
  const tipMinor = toNonNegativeInt(input.tipMinor);
  const availablePoints = toNonNegativeInt(input.availablePoints);

  const withoutPoints = buildLineBreakdown({
    lines: input.lines,
    couponDiscountMinor: input.couponDiscountMinor,
    pointsDiscountMinor: 0,
    redeemCategoryKeys: input.redeemCategoryKeys,
  });
  const maxRedeemablePointsByAmount = Math.floor(withoutPoints.redeemablePoolMinor / pointValueMinor);
  const pointsReserved = input.usePoints
    ? Math.min(availablePoints, maxRedeemablePointsByAmount)
    : 0;
  const requestedPointsDiscountMinor = pointsReserved * pointValueMinor;

  const withPoints = buildLineBreakdown({
    lines: input.lines,
    couponDiscountMinor: input.couponDiscountMinor,
    pointsDiscountMinor: requestedPointsDiscountMinor,
    redeemCategoryKeys: input.redeemCategoryKeys,
  });
  const earnPoolMinor = calculateEarnPoolMinor(withPoints.lineBreakdown, input.earnCategoryKeys);
  const pointsEarned = calculateEarnedPointsFromMinor(earnPoolMinor);
  const totalMinor = Math.max(
    0,
    withPoints.subtotalMinor - withPoints.couponDiscountMinor - withPoints.pointsDiscountMinor + tipMinor,
  );

  return {
    subtotalMinor: withPoints.subtotalMinor,
    couponDiscountMinor: withPoints.couponDiscountMinor,
    redeemablePoolMinor: withPoints.redeemablePoolMinor,
    maxRedeemablePointsByAmount,
    pointsReserved,
    pointsDiscountMinor: withPoints.pointsDiscountMinor,
    tipMinor,
    totalMinor,
    earnPoolMinor,
    pointsEarned,
    lineBreakdown: withPoints.lineBreakdown,
  };
}

export function calculateEarnFromAppliedDiscounts(input: {
  lines: PointsCalcLineInput[];
  couponDiscountMinor: number;
  pointsDiscountMinor: number;
  earnCategoryKeys: string[];
  redeemCategoryKeys: string[];
}): {
  earnPoolMinor: number;
  pointsEarned: number;
  lineBreakdown: PointsCalcLineBreakdown[];
} {
  const result = buildLineBreakdown({
    lines: input.lines,
    couponDiscountMinor: input.couponDiscountMinor,
    pointsDiscountMinor: input.pointsDiscountMinor,
    redeemCategoryKeys: input.redeemCategoryKeys,
  });
  const earnPoolMinor = calculateEarnPoolMinor(result.lineBreakdown, input.earnCategoryKeys);

  return {
    earnPoolMinor,
    pointsEarned: calculateEarnedPointsFromMinor(earnPoolMinor),
    lineBreakdown: result.lineBreakdown,
  };
}
