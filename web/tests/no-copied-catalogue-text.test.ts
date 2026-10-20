import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

interface TitleHashes {
  sha256: string[];
}

const hashes = new Set(
  (
    JSON.parse(
      readFileSync(join(__dirname, '../../tests/support/catalogue-title-hashes.json'), 'utf8'),
    ) as TitleHashes
  ).sha256,
);

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );

// Quoted string literals and text between tags: where a label would sit in the sources.
const candidateTexts = (source: string): string[] =>
  [...source.matchAll(/'([^'\n]+)'|"([^"\n]+)"|>([^<>\n]+)</g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? '',
  );

const isCatalogueTitle = (text: string): boolean =>
  hashes.has(createHash('sha256').update(text.trim().toLowerCase()).digest('hex'));

it('ships no title of the reference catalogue verbatim in the web sources', () => {
  const sources = sourceFiles(join(__dirname, '../src')).map((file) => readFileSync(file, 'utf8'));

  const copied = sources.flatMap(candidateTexts).filter(isCatalogueTitle);

  expect(copied).toEqual([]);
});

it('extracts quoted literals and tag text, and holds the reference hashes', () => {
  expect(hashes.size).toBeGreaterThan(100);
  expect(candidateTexts(`<span>Some label</span> 'other' "third"`)).toEqual([
    'Some label',
    'other',
    'third',
  ]);
});
