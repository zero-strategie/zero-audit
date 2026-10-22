import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string =>
  readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const LEGACY_TABLE_NAMES = [
  'users',
  'sessions',
  'email_tokens',
  'api_launches',
  'projects.owner_id',
  'snapshots.launched_by',
];

const sectionOf = (markdown: string, title: string): string => {
  const start = markdown.indexOf(`\n## ${title}\n`);
  const next = markdown.indexOf('\n## ', start + 1);
  return start === -1 ? '' : markdown.slice(start, next === -1 ? undefined : next);
};

describe('dual licence documents', () => {
  it.each(['COPYRIGHT', 'CLA.md', 'CONTRIBUTING.md'])(
    '%s states AGPL-3.0-only and the hosted service under another licence thanks to the CLA',
    (file) => {
      const text = read(file);
      expect(text).toContain('AGPL-3.0');
      expect(text.toLowerCase()).toContain('hosted');
      expect(text).toContain('CLA');
    },
  );

  it('COPYRIGHT names the exact SPDX identifier', () => {
    expect(read('COPYRIGHT')).toContain('AGPL-3.0-only');
  });

  it('CONTRIBUTING gives the local test command and the testing rules', () => {
    const text = read('CONTRIBUTING.md');
    expect(text).toContain(
      'TEST_DATABASE_URL=postgresql://zero_audit@127.0.0.1:55432/zero_audit_test pnpm test',
    );
    expect(text).toContain('Conventional Commits');
    expect(text).toContain('Internet');
  });
});

describe('legacy account tables', () => {
  const section = sectionOf(read('docs/developer-guide.md'), 'Legacy tables');

  it.each(LEGACY_TABLE_NAMES)('the developer guide documents %s', (name) => {
    expect(section).toContain(`\`${name}\``);
  });

  it('says they are created by the core migrations, used by the hosted product, never dropped', () => {
    expect(section).toContain('migrations');
    expect(section).toContain('hosted');
    expect(section).toContain('never');
  });

  it.each([
    'src/infrastructure/in-memory-snapshot-repository.ts',
    'src/infrastructure/sqlite/sqlite-snapshot-repository.ts',
    'src/infrastructure/postgres/postgres-snapshot-repository.ts',
    'src/composition/storage.ts',
  ])('%s explains the launch journal and points to the guide', (file) => {
    const text = read(file);
    expect(text).toContain('api_launches');
    expect(text).toContain('Legacy tables');
  });
});
