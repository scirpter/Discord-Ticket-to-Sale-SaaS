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

3. `join-gate-worker`
- Runs as a separate Discord application/token for first-join verification.
- Sends DM-first verification prompts, maintains the fallback verify panel, and indexes lookup-channel emails.
- Opens private verification tickets, flags them as sale tickets, grants the verified role, and removes members after 3 failed email attempts.

4. `nuke-worker`
- Runs as a separate Discord application/token for `/nuke`.
- Manages channel nuke scheduling, execution, and safety checks independently from sales traffic.

5. `telegram-worker`
- Handles Telegram workspace linking, sales handoff, points, referrals, and paid-order callbacks.

## Data Layer

- Shared MySQL schema in `packages/core/src/infra/db/schema/tables.ts`.
- Drizzle migrations in `drizzle/migrations`.
- Repository layer returns domain-shaped objects.
- Join-gate state is persisted in:
  - `guild_configs` join-gate columns for per-server configuration
  - `join_gate_members` for each joining member's verification progress
  - `join_gate_email_index` for normalized email matches extracted from lookup channels

## Security and Reliability

- Secrets encrypted with `ENCRYPTION_KEY`.
- Checkout tokens signed with `CHECKOUT_SIGNING_SECRET`.
- Webhook signatures verified from raw body (`X-WC-Webhook-Signature`).
- Idempotent processing (`tenant_id + delivery_id`) and duplicate paid-order guard (`order_session_id`).
- Retry strategy: exponential backoff via `p-retry`, queue control via `p-queue`.
- Join-gate requires Discord `Server Members Intent` and `Message Content Intent` on its dedicated application to detect new joins and index lookup-channel emails.

## Retention Defaults

- Webhook event records: 180 days (operational policy).
- Audit logs: 180 days (operational policy).
