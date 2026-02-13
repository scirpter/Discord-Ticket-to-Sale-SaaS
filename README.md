# Ticket-to-Sale SaaS

Multi-tenant Discord bot + web dashboard for ticket-based sales with WooCommerce and Voodoo Pay payment confirmation.

## Stack

- Node.js `24.13.0`
- `discord.js@14.25.1`
- `next@16.1.6`
- MySQL + Drizzle ORM
- zod + neverthrow + pino + p-retry + p-queue + ulid

## Workspace Layout

- `apps/web-app`: Next.js dashboard + REST/webhook API routes.
- `apps/bot-worker`: Discord interaction worker with `/sale` + component/modal flow.
- `packages/core`: shared domain/config/security/services/repositories.
- `drizzle/migrations`: SQL migrations.

## Required Environment

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DATABASE_URL`

Recommended for production:

- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `SESSION_SECRET`
- `ENCRYPTION_KEY`
- `CHECKOUT_SIGNING_SECRET`
- `SUPER_ADMIN_DISCORD_IDS`
- `BOT_PUBLIC_URL`

Copy `.env.example` to `.env` and fill values.

## Commands

- Install: `pnpm install`
- Bootstrap: `pnpm run setup`
- Dev: `pnpm dev`
- Lint: `pnpm lint --fix`
- Typecheck: `pnpm typecheck`
- Tests: `pnpm test --coverage`
- Build: `pnpm build`
- Migrate: `pnpm migrate`
- Deploy slash commands: `pnpm deploy:commands`

## OAuth + Dashboard

- Login endpoint: `GET /api/auth/discord/login`
- Callback endpoint: `GET /api/auth/discord/callback`
- Dashboard page: `/dashboard`
- Dashboard now loads Discord servers from OAuth (manage-server capable guilds), auto-checks bot installation, and auto-links selected server to workspace.
- Server settings now use Discord channel/role selectors instead of manual ID fields.
- Workspace deletion is available from dashboard for owner/super-admin cleanup.

## Ticket Sale Flow

- Staff runs `/sale` in any server channel where they have required permissions.
- Bot shows product+variant select.
- Bot gathers custom form answers through modals.
- Bot creates `order_session` and sends a short signed `/checkout/:orderSessionId` button URL to ticket.
- `/checkout/:orderSessionId` securely redirects to the provider checkout URL server-side (avoids Discord URL-length limits).
- If Voodoo Pay multi-provider integration is configured, checkout uses hosted `pay.php` provider-selection mode.
- Woo webhook confirms payment (`processing`/`completed`).
- Voodoo Pay callback endpoint can also finalize paid orders.
- API verifies signature, dedupes, retries on failure, fetches Woo order notes.
- Bot posts paid-order details to configured paid-log channel (sensitive fields masked).

## WordPress / WooCommerce Setup

See `docs/wordpress-setup.md` and `docs/wordpress-snippet.php`.

## Production Deployment Guide

For full beginner-friendly DigitalOcean deployment (including private GitHub repo access, custom domain, SSL, Nginx, and PM2), see `SETUP_GUIDE.md`.

## Security Notes

- Secrets are encrypted at rest using AES-256-GCM.
- Super-admin can rotate global bot token from dashboard API.
- All tenant data is scoped by `tenant_id`.
- Webhook payload and audit events are persisted for operational review.
