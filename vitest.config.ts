import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['tests/support/network-guard.setup.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
