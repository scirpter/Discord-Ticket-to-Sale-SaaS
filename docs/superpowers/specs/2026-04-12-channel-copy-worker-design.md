# Channel Copy Worker Design

## Goal

Add a new standalone Discord bot that copies all messages and media from one source channel into one destination channel, including cross-server copies, with its own isolated activation system and no dependency on the dashboard or the existing sales bot flows.

## Approved Scope

- One-time copy only.
- Copy text and attachment/media messages.
- Repost content only, without original author names or timestamps.
- Allow source and destination channels to be in the same server or different servers.
- Require destination-guild activation only for the user running the command.
- If the destination channel is not empty, refuse the run unless the caller explicitly reruns with a force-style confirmation token.
- Keep activation completely separate from `nuke`, `join-gate`, `sports`, and the sales bot.

## Non-Goals

- No live mirroring after the backfill completes.
- No dashboard integration.
- No webhook impersonation or message author spoofing.
- No preservation of reactions, replies, threads, stickers, polls, embeds from external unfurls, or original timestamps.
- No automatic deployment coupling to the other bots beyond workspace scripts and docs updates.

## User Experience

### Slash Commands

The new worker exposes two command groups:

- `/channel-copy`
- `/activation`

`/activation` mirrors the remote activation pattern already used by the standalone workers:

- `/activation grant guild_id:<server-id> user_id:<user-id>`
- `/activation revoke guild_id:<server-id> user_id:<user-id>`
- `/activation list guild_id:<server-id>`

Only `SUPER_ADMIN_DISCORD_IDS` can use `/activation`. The super admin does not need to be present in the target guild. The worker only needs to be present in the target guild.

`/channel-copy` is the operator-facing command group and should include:

- `/channel-copy run source_channel_id:<id> destination_channel_id:<id> [confirm:<token>]`
- `/channel-copy status job_id:<id>`

`run` is executed from the destination guild context. The caller must be activated for the destination guild only. `status` is limited to activated users for the destination guild and shows current state, totals, and the last completed source message.

### Run Flow

1. Caller runs `/channel-copy run`.
2. Worker acknowledges within 3 seconds with an ephemeral deferred reply.
3. Worker validates:
   - caller is activated for the destination guild
   - both channel IDs are valid text-based guild channels
   - bot can read message history in the source channel
   - bot can view, send messages, and attach files in the destination channel
4. Worker checks whether the destination channel already contains messages.
5. If destination is non-empty and no valid confirmation token is supplied, the worker creates an `awaiting_confirmation` job, refuses the run, and returns the exact token required on rerun.
6. When a valid confirmation token is supplied, the worker reuses that pending job, transitions it to `queued`, and starts the backfill.
7. Worker copies source history oldest-to-newest until complete or failed.
8. Worker updates job status and reports the final result ephemerally.

## Architecture

### New Worker

Create a new standalone package:

- `apps/channel-copy-worker`

Expected files:

- `apps/channel-copy-worker/package.json`
- `apps/channel-copy-worker/tsconfig.json`
- `apps/channel-copy-worker/src/index.ts`
- `apps/channel-copy-worker/src/deploy-commands.ts`
- `apps/channel-copy-worker/src/commands/activation.ts`
- `apps/channel-copy-worker/src/commands/activation.test.ts`
- `apps/channel-copy-worker/src/commands/channel-copy.ts`
- `apps/channel-copy-worker/src/commands/channel-copy.test.ts`

This worker follows the same shape as `apps/nuke-worker`:

- dedicated token and client ID
- Discord slash-command deployment script
- interaction router in `src/index.ts`
- ephemeral admin/config responses

No scheduler loop is required for the initial version. The job runs inline after the command creates durable state.

## Core Layer

Add shared persistence and business logic to `packages/core`:

- `packages/core/src/repositories/channel-copy-repository.ts`
- `packages/core/src/services/channel-copy-service.ts`

Export them from `packages/core/src/index.ts`.

Add tests:

- `packages/core/tests/channel-copy-repository.test.ts`
- `packages/core/tests/channel-copy-service.test.ts`

## Data Model

Add two new tables.

### `channel_copy_authorized_users`

Guild-scoped allowlist for the copy bot only.

Columns:

- `id`
- `guild_id`
- `discord_user_id`
- `granted_by_discord_user_id`
- `created_at`
- `updated_at`

Constraints:

- unique on `(guild_id, discord_user_id)`
- index on `guild_id`

This table is fully isolated from `channel_nuke_authorized_users`, `sports_authorized_users`, and `join_gate_authorized_users`.

### `channel_copy_jobs`

Durable execution record for one-time backfills.

Columns:

- `id`
- `destination_guild_id`
- `source_guild_id`
- `source_channel_id`
- `destination_channel_id`
- `requested_by_discord_user_id`
- `confirm_token`
- `status`
- `force_confirmed`
- `started_at`
- `finished_at`
- `last_processed_source_message_id`
- `scanned_message_count`
- `copied_message_count`
- `skipped_message_count`
- `failure_message`
- `created_at`
- `updated_at`

`status` enum:

- `awaiting_confirmation`
- `queued`
- `running`
- `completed`
- `failed`

Indexes:

- `(destination_guild_id, created_at)`
- `(status, updated_at)`

The job record is the source of truth for resumability and status reporting.

## Message Copy Rules

### Included

- plain text message content
- attachment-only messages
- mixed text + attachment messages

### Excluded

- system messages
- unsupported channel types
- messages whose attachments cannot be downloaded after retries

### Repost Format

For each source message:

- if text exists, repost the text
- if attachments exist, download and re-upload them to the destination message
- if both exist, send them together when possible
- if a message has neither text nor attachments that can be reposted, count it as skipped

The destination message does not include original author attribution or original timestamps.

## Permissions

### Caller Permissions

The caller must:

- be activated in the destination guild via `channel_copy_authorized_users`
- be running the command from the destination guild

The caller does not need activation in the source guild.

### Bot Permissions

Before any message fetch or post, the worker verifies the bot has:

Source channel:

- `ViewChannel`
- `ReadMessageHistory`

Destination channel:

- `ViewChannel`
- `SendMessages`
- `AttachFiles`

If any permission is missing, the worker returns an explicit ephemeral error naming the missing permission and the affected channel.

## Force Confirmation

When the destination channel already has at least one message, `run` must refuse the operation unless the caller reruns it with the exact confirmation token provided by the worker.

Behavior:

- worker generates a short opaque token
- worker persists an `awaiting_confirmation` job row with that token before refusing the command
- rerun must supply the same token in `confirm`
- successful forced runs reuse the same job row and mark `force_confirmed=true`

This prevents accidental archive duplication in non-empty channels.

## Execution Strategy

The worker executes the copy through `ChannelCopyService`.

Core responsibilities:

1. Validate activation and channel inputs.
2. Create a job record or resume the latest eligible one for the same requester and channel pair.
3. Fetch source history in pages using `before` cursors.
4. Reverse each fetched page so reposting stays oldest-to-newest.
5. Repost message payloads to the destination.
6. Persist progress after each successfully copied source message.
7. Mark final status with counts and failure details.

### Rate Limits And Retries

- Use bounded retries for Discord fetch/download/post failures.
- Respect Discord rate-limit responses before retrying.
- Fail the job with a user-safe message if retries are exhausted.

### Resumability

If the process restarts mid-copy:

- the service looks up the latest non-completed job for the same requester, source channel, and destination channel
- `awaiting_confirmation` jobs do not execute until the matching `confirm` token is supplied
- the next run resumes after `last_processed_source_message_id`
- already-copied messages are not intentionally replayed from the beginning

For the initial version, resume is triggered by rerunning `/channel-copy run` with the same source and destination channel pair while a prior non-completed job exists for that same requester.

## Error Handling

All failures are explicit and ephemeral.

Examples:

- invalid source or destination channel ID
- source channel not reachable by this bot
- destination channel not writable by this bot
- destination channel non-empty without confirmation token
- copy failed after partial progress

User-facing errors must not include stack traces, raw secrets, or internal SQL errors.

Persisted `failure_message` should be short and actionable, for example:

- `Missing Read Message History in source channel`
- `Destination channel is not empty; rerun with confirm token`
- `Attachment download failed after retries`

## Testing Strategy

### Worker Command Tests

Cover:

- super-admin-only remote activation
- destination-guild activation gating
- refusal when destination channel is non-empty and `confirm` is missing
- acceptance when valid `confirm` token is supplied
- clear errors for missing source/destination permissions
- status command output for queued, running, completed, and failed jobs

### Core Service Tests

Cover:

- separate activation state from other workers
- job creation and resume behavior
- oldest-to-newest repost ordering
- text-only messages
- attachment-only messages
- mixed text + attachment messages
- skipped empty/unsupported messages
- progress counters and `last_processed_source_message_id`
- partial failure persistence

### Repository Tests

Cover:

- allowlist upsert/list/revoke
- job create/update/finalize queries
- resume lookup by incomplete source/destination pair

## Environment And Workspace Updates

Add new env variables to `packages/core/src/config/env.ts` and `.env.example`:

- `CHANNEL_COPY_DISCORD_TOKEN`
- `CHANNEL_COPY_DISCORD_CLIENT_ID`

Update root workspace scripts in `package.json`:

- add worker to `dev`
- add worker to `build`
- add `deploy:commands:channel-copy`
- include it in `deploy:commands`

## Documentation Updates

Update:

- `README.md`
- `SETUP_GUIDE.md` if worker deployment/setup instructions are listed there

Document:

- standalone nature of the worker
- separate activation model
- required Discord permissions
- example `run` and `status` usage
- remote `/activation` usage that does not require the super admin to join the target guild

## File Boundaries

### `apps/channel-copy-worker/src/commands/activation.ts`

Owns remote activation slash-command definitions and interaction handling for the copy bot only.

### `apps/channel-copy-worker/src/commands/channel-copy.ts`

Owns operator command parsing, runtime permission checks, force-confirmation UX, and user-facing status messaging.

### `packages/core/src/services/channel-copy-service.ts`

Owns activation checks, job lifecycle, copy execution, pagination, retries, progress accounting, and service-level result mapping.

### `packages/core/src/repositories/channel-copy-repository.ts`

Owns `channel_copy_authorized_users` and `channel_copy_jobs` persistence.

## Open Decisions Resolved

- One-time backfill only.
- Content-only reposting.
- Force token required for non-empty destination channels.
- Destination-guild activation only.
- Attachment-only messages are copied.
- Activation is fully separate from every other bot.

## Implementation Notes

The implementation plan should follow repo conventions:

- slash command acknowledgement within 3 seconds
- ephemeral errors and admin flows
- repository methods return domain records, not raw DB rows
- Vitest coverage added for every behavior change
- full quality gate before completion:
  - `pnpm lint --fix`
  - `pnpm typecheck`
  - `pnpm test --coverage`
  - `pnpm build`
