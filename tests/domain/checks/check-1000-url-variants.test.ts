import { describe, expect, it } from 'vitest';
import type { Page } from '../../../src/domain/crawl.js';
import { check1000 } from '../../../src/domain/checks/site/check-1000-url-variants.js';
import {
  crawlOf,
  makeHostProbe,
  expectNoCatalogueTitleCopied,
  makePage,
  runCheck,
  u,
} from '../../support/check-fixtures.js';

const run = (pages: Page[]) => runCheck([check1000], 1000, crawlOf(pages));

describe('check 1000 (trailing-slash URL variants)', () => {
  it('warns on the slashless URL when both forms answer 200 without canonical', () => {
    const result = run([makePage(u('x')), makePage(u('x/'))]);

    expect(result.occurrences).toEqual([
      {
        checkId: 1000,
        pageUrl: u('x'),
        info: { variantUrl: u('x/'), kind: 'trailing-slash' },
      },
    ]);
  });

  it('is a crawlability warning', () => {
    expect(check1000).toMatchObject({ severity: 'warning', theme: 'crawlability' });
  });

  it('stays silent when both canonicals point to the same absolute URL', () => {
    const canonical = u('x');

    const result = run([makePage(u('x'), { canonical }), makePage(u('x/'), { canonical })]);

    expect(result.count).toBe(0);
  });

  it('still warns when the canonicals differ', () => {
    const result = run([
      makePage(u('x'), { canonical: u('x') }),
      makePage(u('x/'), { canonical: u('x/') }),
    ]);

    expect(result.count).toBe(1);
  });

  it('stays silent when the slash form redirects to the slashless one', () => {
    const result = run([
      makePage(u('x')),
      makePage(u('x/'), { status: 301, isHtml: false, redirectTarget: u('x') }),
    ]);

    expect(result.count).toBe(0);
  });

  it('keeps the query string on both forms and ignores the root', () => {
    const result = run([
      makePage('https://exemple.com/'),
      makePage(u('x?p=1')),
      makePage(u('x/?p=1')),
    ]);

    expect(result.occurrences.map((o) => o.pageUrl)).toEqual([u('x?p=1')]);
  });

  it('examines every HTML 2xx page', () => {
    const pages = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => makePage(u(n)));
    const result = run([...pages, makePage(u('gone'), { status: 404 })]);

    expect(result.examined).toBe(6);
  });
});

describe('check 1000 (alternate host)', () => {
  const home = 'https://exemple.com/';
  const runHost = (
    probe: Parameters<typeof makeHostProbe>[0],
    rootCanonical: string | null = null,
  ) =>
    runCheck(
      [check1000],
      1000,
      crawlOf(
        [makePage(home, { canonical: rootCanonical })],
        [],
        { robotsFound: false, sitemapFound: false },
        makeHostProbe(probe),
      ),
    );

  it('warns on the home page when the alternate host answers 200 HTML without common canonical', () => {
    expect(runHost({}).occurrences).toEqual([
      {
        checkId: 1000,
        pageUrl: home,
        info: { variantUrl: 'https://www.exemple.com/', kind: 'host' },
      },
    ]);
  });

  it.each([
    ['redirects (301)', { status: 301, isHtml: false }],
    ['is unreachable', { status: null, isHtml: false, error: 'dns' }],
    ['answers 404', { status: 404 }],
    ['answers a non-HTML file', { isHtml: false }],
  ])('stays silent when the alternate host %s', (_name, probe) => {
    expect(runHost(probe).count).toBe(0);
  });

  it('stays silent when both canonicals are the same absolute URL', () => {
    expect(runHost({ canonical: home }, home).count).toBe(0);
  });

  it('still warns when only the alternate host declares a canonical', () => {
    expect(runHost({ canonical: home }).count).toBe(1);
  });

  it('does nothing without a probe', () => {
    expect(run([makePage(home)]).count).toBe(0);
  });
});

describe('check 1000 label', () => {
  it('is written by us: no title of the Semrush catalogue is reused', () => {
    expectNoCatalogueTitleCopied([check1000]);
  });
});
