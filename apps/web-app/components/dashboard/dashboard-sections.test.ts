import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

async function readDashboardSectionsSource(): Promise<string> {
  return await readFile(
    path.resolve(process.cwd(), 'apps/web-app/components/dashboard/dashboard-sections.tsx'),
    'utf8',
  );
}

describe('dashboard sections effect wiring', () => {
  it('keeps Effect Event callbacks out of dependency arrays for dashboard loaders', async () => {
    const source = await readDashboardSectionsSource();

    expect(source).not.toMatch(/\[isLinkedToCurrentTenant,\s*loadWorkspaceAccess,\s*tenantId\]/);
    expect(source).not.toMatch(
      /\[deferredMemberSearch,\s*guildId,\s*isLinkedToCurrentTenant,\s*searchGuildMembers,\s*tenantId,\s*workspaceAccess\?\.canManageMembers\]/,
    );
    expect(source).not.toMatch(/\[config\?\.couponsEnabled,\s*loadCoupons\]/);
    expect(source).not.toMatch(/\[activePointsPanel,\s*config\?\.pointsEnabled,\s*deferredSearch,\s*loadCustomers\]/);
  });
});
