# Coupons, Basket, and Tip Flow

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
8. Bot generates checkout link.

## Total Calculation

`total = basket subtotal - coupon discount + tip`

- Coupon is capped so total never goes below zero from discount alone.
- Tip is added as minor currency amount (pence).
