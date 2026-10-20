import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

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

it('finds the pages that handle a POST', () => {
  expect(postPages.map((page) => page.pathname.split('/src/pages/')[1])).toContain(
    'audits/new.astro',
  );
});

it.each(postPages.map((page) => [page.pathname.split('/src/pages/')[1] ?? '', page] as const))(
  '%s calls isSameOrigin before handling the POST',
  (_, page) => {
    expect(readFileSync(page, 'utf8')).toMatch(/isSameOrigin\(Astro\.request\)/);
  },
);
