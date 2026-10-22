import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REQUIRED_PACK_FILES, checkPackFiles } from '../../scripts/pack-rules.js';

const conformFiles = (): string[] => [...REQUIRED_PACK_FILES, 'dist/domain/audit.js'];

describe('checkPackFiles', () => {
  it('returns no error for a conforming file list', () => {
    expect(checkPackFiles(conformFiles())).toEqual([]);
  });

  it.each([
    'tests/foo.test.ts',
    'src/index.ts',
    'docs/user-guide.md',
    '.env.example',
    'web/package.json',
  ])('names the forbidden file %s', (forbidden) => {
    const errors = checkPackFiles([...conformFiles(), forbidden]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(forbidden);
  });

  it('names every forbidden file', () => {
    const errors = checkPackFiles([...conformFiles(), 'src/index.ts', '.env.example']);
    expect(errors.join('\n')).toContain('src/index.ts');
    expect(errors.join('\n')).toContain('.env.example');
  });

  it.each([
    'dist/index.d.ts',
    'dist/cli/main.js',
    'LICENSE',
    'COPYRIGHT',
    'dist/infrastructure/sqlite/migrations/011_audit_queue.sql',
    'dist/infrastructure/postgres/migrations/001_init.sql',
  ])('names the missing file %s', (missing) => {
    const errors = checkPackFiles(conformFiles().filter((file) => file !== missing));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(missing);
  });
});

describe('REQUIRED_PACK_FILES', () => {
  it.each(['sqlite', 'postgres'])('lists every %s migration present in src', (engine) => {
    const onDisk = readdirSync(`src/infrastructure/${engine}/migrations`)
      .map((name) => `dist/infrastructure/${engine}/migrations/${name}`)
      .sort();
    const required = REQUIRED_PACK_FILES.filter((file) =>
      file.startsWith(`dist/infrastructure/${engine}/migrations/`),
    ).sort();
    expect(required).toEqual(onDisk);
  });

  it('expects 17 migrations', () => {
    expect(REQUIRED_PACK_FILES.filter((file) => file.endsWith('.sql'))).toHaveLength(17);
  });
});
