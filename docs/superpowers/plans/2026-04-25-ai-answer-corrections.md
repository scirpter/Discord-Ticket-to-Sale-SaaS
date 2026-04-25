# AI Answer Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent admin correction buttons to AI bot answers and save corrected answers as Custom Q&A.

**Architecture:** Keep correction state in Discord message components plus existing Custom Q&A storage. The AI worker builds answer payloads with a correction button, opens the correction modal without pre-acknowledgement network I/O, fetches the original user message only after modal submit when the Question field is blank, saves Q&A, then disables the button on the original bot answer.

**Tech Stack:** TypeScript, discord.js v14, Vitest, existing `AiKnowledgeManagementService`.

---

### Task 1: Runtime Correction Tests

**Files:**
- Modify: `apps/ai-worker/src/message-runtime.test.ts`
- Modify: `apps/ai-worker/src/runtime.ts`

- [ ] **Step 1: Write failing tests**

Add tests that expect inline and thread AI answers to send payload objects containing `content` and persistent correction `components`; add button/modal tests for admin-only correction, Q&A save, and disabled saved state.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @voodoo/ai-worker test -- src/message-runtime.test.ts`

Expected: FAIL because correction constants and payload helpers do not exist yet.

- [ ] **Step 3: Implement minimal runtime support**

Add correction custom IDs, answer payload builders, interaction handler branches, modal creation, deferred original message fetch on submit, Q&A save, and button disable logic in `apps/ai-worker/src/runtime.ts`.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @voodoo/ai-worker test -- src/message-runtime.test.ts`

Expected: PASS.

### Task 2: Docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update AI feature docs**

Mention persistent `Mark wrong` buttons on AI answers and admin correction saves to Custom Q&A.

- [ ] **Step 2: Run docs-adjacent checks**

Run: `pnpm lint --fix`

Expected: PASS with no warnings.

### Task 3: Full Verification and Deploy

**Files:**
- No source edits unless verification exposes a defect.

- [ ] **Step 1: Run required quality gate**

Run in order:

```powershell
pnpm lint --fix
pnpm typecheck
pnpm test --coverage
pnpm build
```

Expected: all PASS with no warnings and coverage >=95%.

- [ ] **Step 2: Commit and push**

Commit only relevant source/docs/test changes, leaving unrelated `.env.example` changes untouched. Push to GitHub.

- [ ] **Step 3: Update droplet and smoke test**

Use repo-local `C:\Users\0\Desktop\store\dev\JSTS\Discord\Discord-Ticket-to-Sale-SaaS\.codex-tools\plink.exe` to update `/var/www/voodoo` to the pushed commit and smoke test the AI worker code path.
