import { readdirSync, readFileSync } from 'node:fs';
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import { expect, it } from 'vitest';
import { renderPage } from './account-page-helpers';
import { anAccount, fakeApiClient } from './fake-api-client';

const PAGES_DIR = new URL('../src/pages/', import.meta.url);

const astroPages = (dir: URL): URL[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, dir);
    if (entry.isDirectory()) return astroPages(child);
    return entry.name.endsWith('.astro') ? [child] : [];
  });

const postPages = astroPages(PAGES_DIR).filter((page) =>
  /request\.method\s*===\s*'POST'/.test(readFileSync(page, 'utf8')),
);

const ACCOUNT_POST_PAGES = [
  'inscription',
  'connexion',
  'mot-de-passe-oublie',
  'reinitialiser',
  'verifier-email',
  'compte',
  'deconnexion',
] as const;

it('finds the pages that handle a POST', () => {
  const names = postPages.map((page) => page.pathname.split('/src/pages/')[1]);

  expect(names).toContain('audits/new.astro');
  for (const name of ACCOUNT_POST_PAGES) expect(names).toContain(`${name}.astro`);
});

it.each(ACCOUNT_POST_PAGES)(
  '%s refuses a foreign origin with 403 without calling the API',
  async (name) => {
    const page = (await import(`../src/pages/${name}.astro`)) as { default: AstroComponentFactory };
    const request = new Request(`http://localhost/${name}`, {
      method: 'POST',
      headers: { origin: 'https://evil.example', host: 'localhost' },
      body: new URLSearchParams({ email: 'a@example.test', password: 'x', token: 't' }),
    });

    const response = await renderPage(page.default, request, fakeApiClient({}), anAccount());

    expect(response.status).toBe(403);
  },
);

it.each(postPages.map((page) => [page.pathname.split('/src/pages/')[1] ?? '', page] as const))(
  '%s calls isSameOrigin before handling the POST',
  (_, page) => {
    expect(readFileSync(page, 'utf8')).toMatch(/isSameOrigin\(Astro\.request\)/);
  },
);
