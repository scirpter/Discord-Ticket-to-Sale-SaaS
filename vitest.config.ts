import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@voodoo/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: [
      'packages/core/tests/**/*.test.ts',
      'apps/web-app/**/*.test.ts',
      'apps/bot-worker/**/*.test.ts',
      'apps/nuke-worker/**/*.test.ts',
      'apps/telegram-worker/**/*.test.ts',
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
