# Points & Rewards

## Scope

- Points are store-scoped by `tenant_id + guild_id`.
- Customer identity is normalized email (`trim + lowercase`).
- No points sharing across different merchants/servers.

## Merchant Setup

In dashboard **Server Sales Settings**:

- Set `Value of 1 point` (major currency input, stored as minor integer).
- Select categories that `earn` points.
- Select categories where points can be `redeemed`.
- Save settings.

## Customer Management

Dashboard **Customer Points** supports:

- List customer emails with `balance`, `reserved`, and `available` points.
- Search by email.
- Manual `Add Points`.
- Manual `Remove Points` (overdraw is clamped to zero).

## Checkout Behavior

1. Bot collects basket/coupon/answers/tip.
2. System checks points by email before link generation.
3. If eligible and available, customer gets a `Use Points` choice.
4. If chosen, points are reserved and checkout total is reduced.
5. Payment confirmation consumes reservation and then applies earned points.

## Reservation Lifecycle

- Created when checkout is generated with points.
- Released on order expiry.
- Released on cancellation.
- Consumed on first successful paid event only.
- Late payment after expired release is accepted; system logs anomaly and does not re-deduct released points.

## Commands

- `/points email:<address>`
  - Returns balance for this store.
  - Reply is ephemeral in the channel where command was run.

## Post-Payment Message

- Ticket confirmation includes updated points balance after payment processing.
