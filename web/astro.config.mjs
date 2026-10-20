import process from 'node:process';
import node from '@astrojs/node';
import { defineConfig } from 'astro/config';
import { allowedDomainsFrom } from './src/lib/allowed-domains.ts';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { host: '127.0.0.1', port: 4321 },
  security: {
    // The server listens on loopback only, behind Caddy, which overwrites the client's
    // X-Forwarded-* headers. Astro can therefore trust them to rebuild the public origin and
    // compare it with the form's Origin (checkOrigin stays on).
    // https://docs.astro.build/en/reference/configuration-reference/#securityalloweddomains
    allowedDomains: allowedDomainsFrom(process.env.ZERO_AUDIT_PUBLIC_HOSTS),
  },
});
