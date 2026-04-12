import path from 'node:path';

import { describe, expect, it } from 'vitest';

import nextConfig from '../../../apps/web-app/next.config.ts';
import rootPackageJson from '../../../package.json';
import vitestConfig from '../../../vitest.config.ts';

describe('tooling config', () => {
  it('pins Next output tracing to the worktree root', () => {
    expect(nextConfig.outputFileTracingRoot).toBe(path.resolve(process.cwd()));
  });

  it('suppresses only DEP0040 during the root vitest run', () => {
    expect(rootPackageJson.scripts.test).toContain('--disable-warning=DEP0040');
  });

  it('passes the targeted DEP0040 suppression flag to vitest workers', () => {
    expect(vitestConfig.test?.execArgv).toContain('--disable-warning=DEP0040');
  });

  it('includes the channel-copy worker in root scripts', () => {
    expect(rootPackageJson.scripts.dev).toContain('@voodoo/channel-copy-worker');
    expect(rootPackageJson.scripts.build).toContain('@voodoo/channel-copy-worker');
    expect(rootPackageJson.scripts['deploy:commands']).toContain('deploy:commands:channel-copy');
    expect(rootPackageJson.scripts['deploy:commands:channel-copy']).toBe(
      'pnpm --filter @voodoo/channel-copy-worker deploy:commands',
    );
  });
});
