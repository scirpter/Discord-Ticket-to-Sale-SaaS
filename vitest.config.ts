import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/core/tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
