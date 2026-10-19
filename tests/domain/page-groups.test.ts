import { describe, expect, it } from 'vitest';
import type { CheckResult, Severity } from '../../src/domain/check.js';
import { classifyPages, groupVariation } from '../../src/domain/page-groups.js';
import { makePage, u } from '../support/check-fixtures.js';

const occurrenceOn = (severity: Severity, pageUrl: string | null): CheckResult => ({
  checkId: 1,
  severity,
  theme: 'on-page',
  count: 1,
  examined: 1,
  occurrences: [{ checkId: 1, pageUrl, info: {} }],
});

describe('classifyPages', () => {
  it('assigns each kind of page to its group', () => {
    const pages = [
      makePage(u('blocked'), { blockedByRobots: true, status: null, isHtml: false }),
      makePage(u('404'), { status: 404 }),
      makePage(u('500'), { status: 500 }),
      makePage(u('network'), { status: null, error: 'timeout', isHtml: false }),
      makePage(u('301'), { status: 301, isHtml: false }),
      makePage(u('warning')),
      makePage(u('notice')),
      makePage(u('clean')),
    ];
    const results = [occurrenceOn('warning', u('warning')), occurrenceOn('notice', u('notice'))];

    const counts = classifyPages(pages, results);

    expect(counts.groups.get(u('blocked'))).toBe('blocked');
    expect([u('404'), u('500'), u('network')].map((url) => counts.groups.get(url))).toEqual([
      'broken',
      'broken',
      'broken',
    ]);
    expect(counts.groups.get(u('301'))).toBe('redirect');
    expect(counts.groups.get(u('warning'))).toBe('have-issues');
    expect(counts.groups.get(u('notice'))).toBe('healthy');
    expect(counts.groups.get(u('clean'))).toBe('healthy');
  });

  it('gives priority to broken over issues and to blocked over everything', () => {
    const pages = [makePage(u('gone'), { status: 404 })];

    expect(classifyPages(pages, [occurrenceOn('error', u('gone'))]).groups.get(u('gone'))).toBe(
      'broken',
    );
  });

  it('ignores site-level occurrences', () => {
    const counts = classifyPages([makePage(u('a'))], [occurrenceOn('error', null)]);

    expect(counts.groups.get(u('a'))).toBe('healthy');
  });

  it('classes a non-HTML 2xx page as healthy', () => {
    const pages = [makePage(u('doc.pdf'), { isHtml: false })];

    expect(classifyPages(pages, [occurrenceOn('error', u('doc.pdf'))]).counts.healthy).toBe(1);
  });

  it('puts every page in exactly one group', () => {
    const pages = [
      makePage(u('a')),
      makePage(u('b'), { status: 302, isHtml: false }),
      makePage(u('c'), { blockedByRobots: true, status: null }),
    ];

    const { counts } = classifyPages(pages, []);

    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(pages.length);
  });
});

describe('groupVariation', () => {
  const countsOf = (healthy: number) => ({
    healthy,
    'have-issues': 0,
    broken: 0,
    redirect: 0,
    blocked: 0,
  });

  it('is the difference per group', () => {
    expect(groupVariation(countsOf(5), countsOf(4)).healthy).toBe(-1);
  });

  it('is null for every group without a previous snapshot', () => {
    expect(Object.values(groupVariation(null, countsOf(4)))).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});
