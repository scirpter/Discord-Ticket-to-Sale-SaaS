import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

async function readDashboardShellSource(): Promise<string> {
  return await readFile(
    path.resolve(process.cwd(), 'apps/web-app/components/dashboard/dashboard-shell.tsx'),
    'utf8',
  );
}

describe('dashboard shell navigation', () => {
  it('includes a dedicated sales destination and a visible invite-bot action', async () => {
    const source = await readDashboardShellSource();

    expect(source).toContain("label: 'Sales'");
    expect(source).toContain('Invite Bot');
    expect(source).toContain('resources?.inviteUrl');
  });
});
