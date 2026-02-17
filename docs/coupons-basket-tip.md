# Coupons, Basket, Tip, and Points Flow

## Server Settings

- Open dashboard and select workspace + Discord server.
- In **Server Sales Settings**, enable or disable:
  - `Ask customer for optional tip before checkout link generation`.

## Coupon Management

- Open dashboard section **Coupons**.
- Create coupon:
  - `Code` (e.g. `SAVE10`).
  - `Discount Amount (GBP)` (fixed amount).
  - `Active` toggle.
- Coupons are scoped per server.
- Coupons can be edited or deleted at any time.

## Bot Sale Flow

1. Staff starts `/sale`.
2. Customer/staff selects `Category -> Product -> Price option`.
3. Bot asks whether to add more products to basket.
4. Bot shows optional coupon step.
5. Bot collects customer answers (category question set).
6. If tip is enabled, bot asks tip `Yes/No`.
7. If `Yes`, customer enters custom GBP tip amount.
8. Bot checks points (by customer email) and offers `Use Points` when eligible.
9. Bot generates checkout link.

## Total Calculation

`total = basket subtotal - coupon discount + tip`

- Coupon is capped so total never goes below zero from discount alone.
- Tip is added as minor currency amount (pence).

## Points Ordering and Formula

1. Basket subtotal is calculated from all basket lines.
2. Coupon discount is allocated proportionally across all lines (deterministic remainder by basket index).
3. Redeemable pool is calculated only from categories configured as redeemable.
4. Max redeemable points = `floor(redeemablePoolMinor / pointValueMinor)`.
5. If customer opts in, reserved points = `min(availablePoints, maxRedeemablePoints)`.
6. Points discount is allocated proportionally across redeemable lines only.
7. Earn pool is calculated from net line amounts in earn-enabled categories only.
8. Earned points = `floor(earnPoolMinor / pointValueMinor)`.
9. Final total = `subtotal - coupon - points + tip`.

Rules:

- Tip is excluded from earn/redeem calculations.
- Points are reserved when checkout is created.
- Points are deducted only after payment confirmation.
