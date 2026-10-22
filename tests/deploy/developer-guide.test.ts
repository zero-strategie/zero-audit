import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const guide = readFileSync(new URL('../../docs/developer-guide.md', import.meta.url), 'utf8');

const sectionOf = (title: string): string => {
  const start = guide.indexOf(`\n## ${title}\n`);
  const next = guide.indexOf('\n## ', start + 1);
  return start === -1 ? '' : guide.slice(start, next === -1 ? undefined : next);
};

describe('developer guide of the core', () => {
  it.each(['fastify', 'docker', 'dashboard'])('does not mention %s', (text) => {
    expect(guide.toLowerCase()).not.toContain(text);
  });

  it.each(['Architecture', 'Using the library', 'Writing a storage adapter', 'Publishing'])(
    'has a section titled %s',
    (title) => {
      expect(sectionOf(title)).not.toBe('');
    },
  );

  it('shows how to use the library with the real export names', () => {
    const section = sectionOf('Using the library');
    for (const text of [
      'createStorage',
      'storage.connection',
      'AssertPublicTarget',
      'QueueAudit',
      'Reader',
      'isAdmin',
    ]) {
      expect(section).toContain(text);
    }
    expect(section.indexOf('AssertPublicTarget')).toBeLessThan(section.indexOf('QueueAudit'));
  });

  it('lists the ports of a storage adapter and the contract suites without skip', () => {
    const section = sectionOf('Writing a storage adapter');
    for (const text of [
      'ProjectRepository',
      'SnapshotRepository',
      'AuditQueue',
      'StorageHealth',
      'tests/support/',
      'SQLite',
      'Postgres',
      'skip',
    ]) {
      expect(section).toContain(text);
    }
  });

  it('lists the publishing prerequisites and the interim consumption', () => {
    const section = sectionOf('Publishing');
    for (const text of ['@zero-strategie', 'NPM_TOKEN', 'public', 'provenance', 'tarball', 'git']) {
      expect(section).toContain(text);
    }
  });

  it('gives the local test command with the throwaway database', () => {
    expect(guide).toContain(
      'TEST_DATABASE_URL=postgresql://zero_audit@127.0.0.1:55432/zero_audit_test pnpm test',
    );
  });
});
