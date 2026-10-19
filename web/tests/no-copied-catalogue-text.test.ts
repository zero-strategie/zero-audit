import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

interface Catalogue {
  issues: { title_fr: string; title_en: string }[];
}

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );

it('ships no title of the Semrush reference catalogue verbatim in the web sources', () => {
  const catalogue = JSON.parse(
    readFileSync(join(__dirname, '../../docs/reference/site-audit-issues.json'), 'utf8'),
  ) as Catalogue;
  const titles = catalogue.issues.flatMap(({ title_fr, title_en }) => [title_fr, title_en]);
  const sources = sourceFiles(join(__dirname, '../src')).map((file) => readFileSync(file, 'utf8'));

  const copied = titles.filter((title) =>
    sources.some((source) => source.includes(`'${title}'`) || source.includes(`>${title}<`)),
  );

  expect(copied).toEqual([]);
});
