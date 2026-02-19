import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_TUTORIAL_COOKIE_KEY,
  DASHBOARD_TUTORIAL_STORAGE_KEY,
  buildDashboardTutorialCookie,
  buildDashboardTutorialSteps,
  hasDashboardTutorialMarker,
} from './dashboard-tutorial';

describe('dashboard tutorial marker', () => {
  it('returns false when cookie and local storage marker are missing', () => {
    expect(hasDashboardTutorialMarker('', null)).toBe(false);
  });

  it('returns true when cookie marker exists', () => {
    const cookie = `${DASHBOARD_TUTORIAL_COOKIE_KEY}=1; Path=/; SameSite=Lax`;
    expect(hasDashboardTutorialMarker(cookie, null)).toBe(true);
  });

  it('returns true when local storage marker exists', () => {
    expect(hasDashboardTutorialMarker('', '1')).toBe(true);
  });
});

describe('dashboard tutorial cookie builder', () => {
  it('includes required persistent attributes', () => {
    const cookie = buildDashboardTutorialCookie({ secure: false });
    expect(cookie).toContain(`${DASHBOARD_TUTORIAL_COOKIE_KEY}=1`);
    expect(cookie).toContain('Max-Age=2147483647');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
  });

  it('adds secure flag for https contexts', () => {
    const cookie = buildDashboardTutorialCookie({ secure: true });
    expect(cookie).toContain('Secure');
  });
});

describe('dashboard tutorial steps', () => {
  it('excludes super-admin-only steps for tenant sessions', () => {
    const steps = buildDashboardTutorialSteps({ isSuperAdmin: false });
    const selectors = steps
      .map((step) => step.element)
      .filter((element): element is string => typeof element === 'string');
    expect(selectors).not.toContain("[data-tutorial='super-admin-card']");
    expect(selectors).not.toContain("[data-tutorial='super-admin-list-tenants']");
    expect(selectors).not.toContain("[data-tutorial='super-admin-list-users']");
    expect(selectors).not.toContain('#global-bot-token');
  });

  it('includes super-admin-only steps for super-admin sessions', () => {
    const steps = buildDashboardTutorialSteps({ isSuperAdmin: true });
    const selectors = steps
      .map((step) => step.element)
      .filter((element): element is string => typeof element === 'string');
    expect(selectors).toContain("[data-tutorial='super-admin-card']");
    expect(selectors).toContain("[data-tutorial='super-admin-list-tenants']");
    expect(selectors).toContain("[data-tutorial='super-admin-list-users']");
    expect(selectors).toContain('#global-bot-token');
  });

  it('is deterministic and keeps unique selectors', () => {
    const first = buildDashboardTutorialSteps({ isSuperAdmin: true });
    const second = buildDashboardTutorialSteps({ isSuperAdmin: true });
    expect(first).toEqual(second);

    const selectors = first
      .map((step) => step.element)
      .filter((element): element is string => typeof element === 'string');
    expect(new Set(selectors).size).toBe(selectors.length);
  });

  it('uses the shared tutorial storage key in tests', () => {
    expect(DASHBOARD_TUTORIAL_STORAGE_KEY).toBe('vd_dashboard_tutorial_seen_v1');
  });
});
