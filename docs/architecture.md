# Architecture

## Processes

1. `web-app`
- Hosts dashboard pages and API/webhook routes.
- Handles Discord OAuth and session cookie auth.
- Runs Woo webhook receiver and enqueue/retry logic.

2. `bot-worker`
- Handles Discord interactions.
- Enforces sale permissions and ticket metadata checks.
- Executes `/sale` component+modal workflow.

## Data Layer

- Shared MySQL schema in `packages/core/src/infra/db/schema/tables.ts`.
- Drizzle migrations in `drizzle/migrations`.
- Repository layer returns domain-shaped objects.

## Security and Reliability

- Secrets encrypted with `ENCRYPTION_KEY`.
- Checkout tokens signed with `CHECKOUT_SIGNING_SECRET`.
- Webhook signatures verified from raw body (`X-WC-Webhook-Signature`).
- Idempotent processing (`tenant_id + delivery_id`) and duplicate paid-order guard (`order_session_id`).
- Retry strategy: exponential backoff via `p-retry`, queue control via `p-queue`.

## Retention Defaults

- Webhook event records: 180 days (operational policy).
- Audit logs: 180 days (operational policy).
