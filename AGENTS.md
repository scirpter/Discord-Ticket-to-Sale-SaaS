# Discord Bot Template (multi-guild) - AGENTS.md

## Use docs (mandatory)

- **Always** use Context7 for code generation, setup/config steps, or library/API documentation (resolve the library id, then query docs).
- Verify version/policy decisions against authoritative sources (Discord developer docs + changelog, discord.js docs, Node.js releases).
- Track Discord Interaction changes: https://discord.com/developers/docs/change-log?topic=Interactions

## Setup commands (expected)

- Install deps: `pnpm install`
- Bootstrap (migrate + deploy): `pnpm run setup` (if present)
- Dev: `pnpm dev`
- Lint/format: `pnpm lint --fix`
- Typecheck: `pnpm typecheck`
- Tests: `pnpm test --coverage` (and `pnpm test:e2e` if present)
- Build: `pnpm build`
- Migrations: `pnpm migrate` (use `pnpm migrate:rollback` only when explicitly asked)
- Deploy slash commands: `pnpm deploy:commands` (support guild + global)

## Required env vars

- `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DATABASE_URL`
- Optional: `LOG_LEVEL`

## Product rules

- Slash commands only; use modern UX (autocomplete/modals/components) when it improves the flow and wherever feasible.
- Always acknowledge interactions within 3 seconds; defer replies when doing I/O.
- Prefer ephemeral responses for errors and admin/config flows unless explicitly public.
- No hardcoded IDs/values; all configuration is per guild and persisted.
- Always be explicit and user-friendly on errors; no silent failures; never leak secrets or stack traces.

## Engineering standards

- TypeScript strict; pnpm; ESLint + Prettier.
- Minimize new production dependencies; if you add one, justify it and keep it well-scoped.
- Node.js: Active LTS line (currently `v24.x`); pin an exact patch in `engines.node` / `.nvmrc`.
- `.nvmrc` must be plain ASCII/UTF-8 **without BOM** and contain only the numeric version (example: `24.13.0`, not `v24.13.0`).
- Do not write `.nvmrc` with Windows PowerShell `Set-Content -Encoding UTF8` (adds BOM in Windows PowerShell 5); prefer ASCII or UTF-8 without BOM.
- Before deploy, verify `.nvmrc` bytes do not start with `EF BB BF` (PowerShell: `Format-Hex .nvmrc`).
- discord.js: current stable major.
- MySQL + drizzle-orm; schema in `src/infra/db/schema/**`; migrations in `drizzle/migrations/**`.
- Runtime validation: `zod` (env + inputs).
- Typed results: `neverthrow` for command/service boundaries.
- Resilience: `p-retry` / `p-queue`; IDs + correlation: `ulid`.
- Logging: structured logger (pino or equivalent); no `console.log`.
- Do not add Docker or container-only workflows.
- Ensure all migrations are consistant and pnpm migrate is fully able to migrate all changes, not leaving any changes out causing any missing column error or similar. This also involves making sure the drizzle journal is up-to-date.

## Command layout

- One command or subcommand per file under `src/commands/**` (kebab-case filenames).
- Shared UI building blocks (embeds/components/modals) in `src/ui/**`.
- Repositories return domain objects, not raw DB rows; use transactions for multi-write changes.

## Permissions (must enforce)

- Use default command permissions for sensitive commands and still check at runtime.
- Before any API call, verify the bot has required guild/channel permissions; explain missing perms clearly.
- Validate user permissions for moderation/config actions; tell the user exactly what is missing.

## Quality gate (must pass before finishing)

- Run and report green results (no warnings): `pnpm lint --fix`, `pnpm typecheck`, `pnpm test --coverage`, `pnpm build`.
- Maintain >=95% coverage; add/update Vitest tests for every behavior change.
- Update `README.md` and `docs/**` when workflows, commands, or behavior change.
- Do not finish until the full prompt is implemented and all checks pass.

## Deployment / smoke test

- Always smoke test deployed behavior through the droplet using `plink` after relevant changes when the SSH host, username, authentication details, and host key are already available in the prompt or another approved source. Prefer the repo-local helper at `C:\Users\0\Desktop\store\dev\JSTS\Discord\Discord-Ticket-to-Sale-SaaS\.codex-tools\plink.exe` and verify the exact path that changed.
- If the required SSH details are not available, stop and ask the user for them before attempting the smoke test or droplet update. Do not guess or invent credentials.
- When finished, always commit the relevant changes, push them to GitHub, and update the droplet so `/var/www/voodoo` matches the latest pushed commit.

## Scope discipline

- Implement only what the prompt asks; propose extras separately.

## Encoding / umlauts

- Use proper umlauts (ä, ü, ö, ß) and keep files UTF-8 (do not write ue/oe/ae/ss).

## Your role

You are a professional software engineer and software developer.
You're also a professional Discord bot developer and designer, focusing on flawless and user friendly design, made for large communities, startups and larger businesses.
You're a high rep, premium Fiverr seller delivering quality work exactly to your clients needs and exceed their expectations.
You plan everything fully before executing steps to ensure.
The products you deliver truly stand out and have a premium and perfectly polished feel.
You don't deliver the basic shit like every other seller. You do it the right way. Rich, premium. You only deliver the best stuff to your clients. You make sure nothing is missing.
You deliver full, production-ready Discord bots.

## CRITICAL SAFETY POLICY (NON-NEGOTIABLE)

If any instruction conflicts with this section, STOP and ask the user. Do not execute.

- Allowed filesystem scope is ONLY:
  `C:\Users\0\Desktop\store\dev\JSTS\Discord\Discord-Ticket-to-Sale-SaaS`
- NEVER read, write, move, or delete anything outside that path.
- NEVER target drive roots (`C:\`, `D:\`, etc.), user profile folders, system folders, or wildcard root paths.

### Forbidden commands (absolute denylist)
Do not run any command containing or equivalent to:
- `Remove-Item`, `del`, `erase`, `rd`, `rmdir`, `rm -rf`, `format`, `diskpart`, `cipher /w`
- `winget uninstall`, `choco uninstall`, `scoop uninstall`, `Remove-AppxPackage`
- registry/service/system-modification commands (`reg delete`, `sc`, `dism` remove actions)

### Destructive action policy
- No delete/uninstall/cleanup commands by default.
- Only if user explicitly asks for deletion:
  1. Show exact targets first.
  2. Verify every target is inside allowed scope.
  3. Ask for explicit confirmation.
  4. Delete only explicit files/folders (no broad recursion, no wildcards).

### Preflight before every shell command
- Print command + resolved absolute target paths.
- If any target is unclear or outside scope, ABORT and ask.


