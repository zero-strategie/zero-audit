import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', '..', 'src');
const INNER_LAYERS = ['composition', 'application', 'domain', 'infrastructure'];
const CLI_IMPORT = /from\s+'(\.\.\/)+cli\//;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : entry.name.endsWith('.ts')
        ? [join(dir, entry.name)]
        : [],
  );

describe('layering', () => {
  it('keeps src/cli out of composition, application, domain and infrastructure', () => {
    const offenders = INNER_LAYERS.flatMap((layer) => sourceFiles(join(SRC, layer))).filter(
      (file) => CLI_IMPORT.test(readFileSync(file, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });
});
