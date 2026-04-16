# Dashboard Tip Toggle Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the missing dashboard tipping toggle so merchants can enable or disable the optional sale tip prompt again from Server settings.

**Architecture:** Keep the existing backend contract untouched because `tipEnabled` is still persisted and consumed by the sale flow. Extract the Settings menu definition into a small testable frontend helper, add regression tests around the menu + tutorial routing, and render a dedicated `Tipping` panel in the existing Server settings section that saves through `saveConfig`.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest

---

### Task 1: Make the settings menu testable and prove the missing entry

**Files:**
- Create: `apps/web-app/lib/dashboard-settings-menu.ts`
- Create: `apps/web-app/lib/dashboard-settings-menu.test.ts`
- Modify: `apps/web-app/components/dashboard/dashboard-sections.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import { SETTINGS_MENU_ITEMS } from './dashboard-settings-menu';

describe('SETTINGS_MENU_ITEMS', () => {
  it('includes the tipping panel between paid logs and Telegram', () => {
    expect(SETTINGS_MENU_ITEMS.map((item) => item.id)).toEqual([
      'default-currency',
      'staff-roles',
      'paid-log-channel',
      'tipping',
      'telegram',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/web-app/lib/dashboard-settings-menu.test.ts`
Expected: FAIL because `dashboard-settings-menu.ts` does not exist yet and the new `tipping` item is not defined anywhere reusable.

- [ ] **Step 3: Write minimal implementation**

```ts
export const SETTINGS_MENU_ITEMS = [
  {
    id: 'default-currency',
    label: 'Default Currency',
    description: 'Choose the money format used across checkout and summary cards.',
    info: 'This becomes the primary dashboard currency display for the selected Discord server.',
  },
  {
    id: 'staff-roles',
    label: 'Staff Roles',
    description: 'Control which Discord roles can manage sales operations.',
    info: 'Only the roles selected here should be able to work paid-order and support flows.',
  },
  {
    id: 'paid-log-channel',
    label: 'Paid Log Channel',
    description: 'Pick where successful payment notifications should land.',
    info: 'Use a private channel that your moderators or staff can monitor without cluttering public chat.',
  },
  {
    id: 'tipping',
    label: 'Tipping',
    description: 'Turn the optional checkout tip prompt on or off.',
    info: 'When enabled, the sales flow asks whether the customer wants to add an optional GBP tip before checkout.',
  },
  {
    id: 'telegram',
    label: 'Telegram Integration',
    description: 'Enable the bridge, generate an invite, and connect a Telegram chat.',
    info: 'When disabled, Telegram connect controls stay hidden and the backend rejects new connection attempts.',
  },
] as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/web-app/lib/dashboard-settings-menu.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web-app/lib/dashboard-settings-menu.ts apps/web-app/lib/dashboard-settings-menu.test.ts apps/web-app/components/dashboard/dashboard-sections.tsx
git commit -m "test: cover dashboard tipping menu entry"
```

### Task 2: Restore the tipping panel in Server settings

**Files:**
- Modify: `apps/web-app/components/dashboard/dashboard-sections.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import { SETTINGS_MENU_ITEMS } from '@/lib/dashboard-settings-menu';

describe('server settings tipping copy', () => {
  it('describes tipping as part of server settings', () => {
    const tipping = SETTINGS_MENU_ITEMS.find((item) => item.id === 'tipping');

    expect(tipping?.label).toBe('Tipping');
    expect(tipping?.description).toContain('tip prompt');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/web-app/lib/dashboard-settings-menu.test.ts`
Expected: FAIL until the menu data and UI copy both use the restored tipping language.

- [ ] **Step 3: Write minimal implementation**

```tsx
const [tipEnabled, setTipEnabled] = useState(false);

useEffect(() => {
  if (!config) return;
  setTipEnabled(config.tipEnabled);
}, [config]);

async function handleSave() {
  await saveConfig({
    defaultCurrency,
    paidLogChannelId: paidLogChannelId || null,
    staffRoleIds,
    telegramEnabled,
    tipEnabled,
  });
}

{activeSettingsPanel === 'tipping' ? (
  <Panel
    title={
      <span className="flex items-center gap-2">
        Tipping
        <InfoButton label="Control whether the sales flow asks the customer if they want to add an optional GBP tip before checkout." />
      </span>
    }
    description="Turn the optional tip prompt on or off for this Discord server."
  >
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-[1.2rem] border border-border/70 bg-background/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Enable optional tipping</p>
          <p className="text-sm text-muted-foreground">
            When enabled, customers are asked if they want to add a GBP tip before their checkout link is generated.
          </p>
        </div>
        <FeatureToggle checked={tipEnabled} label="Enable tipping" onChange={setTipEnabled} />
      </div>
      <InfoTip id="tip-enabled">
        Save after changing this toggle so the live Discord and Telegram sale flows pick up the updated tipping behavior.
      </InfoTip>
    </div>
  </Panel>
) : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/web-app/lib/dashboard-settings-menu.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web-app/components/dashboard/dashboard-sections.tsx apps/web-app/lib/dashboard-settings-menu.ts apps/web-app/lib/dashboard-settings-menu.test.ts
git commit -m "feat: restore dashboard tipping toggle"
```

### Task 3: Keep tutorial focus + docs aligned with the restored settings menu

**Files:**
- Modify: `apps/web-app/lib/dashboard-layout.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the failing test**

```ts
it('maps the tipping tutorial step to the sales panel', () => {
  expect(getDashboardFocusForTutorialStep('tip-enabled')).toEqual({
    dashboard: 'sales',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/web-app/lib/dashboard-layout.test.ts`
Expected: FAIL if the explicit tip routing assertion is missing.

- [ ] **Step 3: Write minimal implementation**

```md
- Settings now uses an internal sidebar flow for default currency, staff roles, paid-log channel, tipping, and Telegram integration.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/web-app/lib/dashboard-layout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web-app/lib/dashboard-layout.test.ts README.md
git commit -m "docs: align dashboard settings copy with tipping panel"
```

### Task 4: Full verification and release

**Files:**
- Modify: `apps/web-app/components/dashboard/dashboard-sections.tsx`
- Modify: `apps/web-app/lib/dashboard-settings-menu.ts`
- Modify: `apps/web-app/lib/dashboard-settings-menu.test.ts`
- Modify: `apps/web-app/lib/dashboard-layout.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Run formatter/lint fix**

Run: `pnpm lint --fix`
Expected: PASS with no warnings

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Run coverage**

Run: `pnpm test --coverage`
Expected: PASS with overall coverage at or above 95%

- [ ] **Step 4: Run production build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 5: Commit, push, deploy, and smoke test**

```bash
git add apps/web-app/components/dashboard/dashboard-sections.tsx apps/web-app/lib/dashboard-settings-menu.ts apps/web-app/lib/dashboard-settings-menu.test.ts apps/web-app/lib/dashboard-layout.test.ts README.md docs/superpowers/plans/2026-04-16-dashboard-tip-toggle-restore.md
git commit -m "feat: restore dashboard tipping settings"
git push
```

Then update the droplet checkout at `/var/www/voodoo` to the pushed commit and smoke test the changed dashboard settings route with the repo-local `plink.exe`.
