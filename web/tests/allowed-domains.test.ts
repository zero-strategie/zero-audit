import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { allowedDomainsFrom } from '../src/lib/allowed-domains';

it('builds one https domain per listed host', () => {
  expect(allowedDomainsFrom('audit.example.test, other.example.test')).toEqual([
    { hostname: 'audit.example.test', protocol: 'https' },
    { hostname: 'other.example.test', protocol: 'https' },
  ]);
});

it('falls back to any https host when the value is empty', () => {
  expect(allowedDomainsFrom('  , ')).toEqual([{ protocol: 'https' }]);
});

it('falls back to any https host when the variable is absent', () => {
  expect(allowedDomainsFrom(undefined)).toEqual([{ protocol: 'https' }]);
});

const config = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');

it('keeps the native origin check enabled', () => {
  expect(config).not.toMatch(/checkOrigin\s*:\s*false/);
});

it('trusts forwarded hosts through allowedDomains', () => {
  expect(config).toMatch(
    /allowedDomains\s*:\s*allowedDomainsFrom\(process\.env\.ZERO_AUDIT_PUBLIC_HOSTS\)/,
  );
});
