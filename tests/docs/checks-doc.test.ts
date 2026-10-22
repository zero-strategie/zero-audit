import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allChecks } from '../../src/domain/checks/index.js';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

const checksDoc = read('../../docs/checks.md');
const TABLE_ROW = /^\| (\d+) \| (\w+) \| ([\w-]+) \| (page|site) \|/gm;
const documentedRows = [...checksDoc.matchAll(TABLE_ROW)].map((match) => ({
  id: Number(match[1]),
  severity: match[2],
  theme: match[3],
  scope: match[4],
}));

describe('checks documentation', () => {
  it('has one row per registered check, with its severity, theme and scope', () => {
    const registered = allChecks.map((check) => ({
      id: check.id,
      severity: check.severity,
      theme: check.theme,
      scope: check.scope,
    }));

    expect(documentedRows).toEqual([...registered].sort((a, b) => a.id - b.id));
  });

  it.each([
    ['README.md', '../../README.md'],
    ['docs/user-guide.md', '../../docs/user-guide.md'],
    ['docs/checks.md', '../../docs/checks.md'],
  ])('announces the registered number of checks in %s', (_name, path) => {
    expect(read(path)).toMatch(new RegExp(`\\b${String(allChecks.length)} checks\\b`));
  });
});
