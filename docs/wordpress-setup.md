# WordPress / WooCommerce Setup

## 1) Configure Woo Webhook in Dashboard

- Set WordPress base URL
- Set webhook secret
- Set Woo consumer key + secret
- Save and copy generated webhook URL

## 2) Create Woo Webhook

Topic should include order status updates (`order.updated` or equivalent), targeting the generated webhook URL.

Headers expected by API:

- `X-WC-Webhook-Signature`
- `X-WC-Webhook-Topic`
- `X-WC-Webhook-Delivery-ID`

## 3) Add Order Correlation Snippet

Add `docs/wordpress-snippet.php` through a lightweight custom plugin or snippet manager.

The snippet persists:

- `vd_order_session_id`
- optional `vd_ticket_channel_id`

This ensures deterministic webhook-to-ticket matching.

## 4) Paid Log Output

When webhook indicates paid state (`processing` or `completed`):

- Sale session is finalized.
- Woo order notes are fetched from `/wp-json/wc/v3/orders/{id}/notes`.
- Paid order entry is posted to configured Discord paid-log channel.

## 5) Hosted Multi-Coin Callback Notes

When Hosted Multi-Coin mode is enabled in dashboard:

- Checkout creation posts to `POST /crypto/multi-hosted-wallet.php`.
- Required request keys: `fiat_amount`, `fiat_currency`, `callback`.
- Optional wallet keys: `evm`, `btc`, `bitcoincash`, `ltc`, `doge`, `trc20`, `solana`.
- Callback is routed to the same Voodoo webhook endpoints and should include:
  - `order_session_id`
  - `cb_token`
  - transaction/payment fields (`txid_in`, `status`, `value_coin`, `ipn_token` equivalents)

This keeps crypto and standard Voodoo payment confirmation on one webhook pipeline.
