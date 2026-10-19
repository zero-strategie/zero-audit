/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    setupFiles: ['../tests/support/network-guard.setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
});
