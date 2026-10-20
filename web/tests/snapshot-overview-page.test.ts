import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, it } from 'vitest';
import OverviewPage from '../src/pages/snapshots/[id]/index.astro';
import { ApiUnreachable, NotFound } from '../src/lib/api/errors';
import type { SnapshotReport } from '../src/lib/api/types';
import type { SnapshotListing } from '../src/lib/api/types';
import { aReport, aSnapshotListing, fakeApiClient } from './fake-api-client';

const render = async (
  getSnapshotReport: (id: string) => Promise<SnapshotReport>,
  snapshots: SnapshotListing[] = [aSnapshotListing()],
) => {
  const container = await AstroContainer.create();
  return container.renderToResponse(OverviewPage, {
    params: { id: 's1' },
    locals: {
      apiClient: fakeApiClient({
        getSnapshotReport,
        listProjectSnapshots: () => Promise.resolve(snapshots),
      }),
    },
  });
};

const renderReport = async (report: SnapshotReport) =>
  (await render(() => Promise.resolve(report))).text();

it('shows the health score and its variation', async () => {
  const html = await renderReport(aReport());

  expect(html).toMatch(/data-testid="health-score"[^>]*>\s*82 \(\+2\)\s*</);
});

it('shows the bare score when the health variation is null', async () => {
  const html = await renderReport(aReport({ health: { score: 82, variation: null } }));

  expect(html).toMatch(/data-testid="health-score"[^>]*>\s*82\s*</);
});

it('shows "Non calculable" for the https theme when its score is null', async () => {
  const html = await renderReport(aReport());

  expect(html).toMatch(/data-testid="theme-https"[^>]*>[^]*?Non calculable/);
});

it('shows error, warning and notice counters', async () => {
  const html = await renderReport(aReport());

  expect(html).toMatch(/data-testid="count-errors"[^>]*>\s*11\s*</);
  expect(html).toMatch(/data-testid="count-warnings"[^>]*>\s*22\s*</);
  expect(html).toMatch(/data-testid="count-notices"[^>]*>\s*33\s*</);
});

it('shows the five page groups with their variation', async () => {
  const html = await renderReport(aReport());

  for (const group of ['healthy', 'have-issues', 'broken', 'redirect', 'blocked']) {
    expect(html).toContain(`data-testid="group-${group}"`);
  }
  expect(html).toMatch(/data-testid="group-healthy"[^]*?\+3/);
});

it('shows a dash for a page group whose variation is null', async () => {
  const report = aReport();
  const html = await renderReport({
    ...report,
    pageGroups: { ...report.pageGroups, healthy: { count: 20, variation: null } },
  });

  expect(html).toMatch(/data-testid="group-healthy"[^>]*>[^<]*20 \(—\)/);
});

it('lists the top issues with a link to their detail', async () => {
  const html = await renderReport(aReport());

  expect(html).toContain('Même meta description sur plusieurs pages');
  expect(html).toMatch(/href="\/snapshots\/s1\/issues\/15"/);
});

it('shows the status of robots.txt, sitemaps and llms.txt', async () => {
  const html = await renderReport(aReport());

  expect(html).toMatch(/data-testid="site-file-robots"[^]*?200/);
  expect(html).toMatch(/data-testid="site-file-sitemap"[^]*?404/);
  expect(html).toMatch(/data-testid="site-file-llms"[^]*?timeout/);
});

it('renders an "Audit introuvable" page with status 404', async () => {
  const response = await render(() => Promise.reject(new NotFound('Snapshot')));

  expect(response.status).toBe(404);
  expect(await response.text()).toContain('Audit introuvable');
});

it('renders a 502 error page when the API is unreachable', async () => {
  const response = await render(() => Promise.reject(new ApiUnreachable('refused')));

  expect(response.status).toBe(502);
  expect(await response.text()).toContain('ZERO_AUDIT_API_URL');
});

it('links to the issues screen', async () => {
  const html = await renderReport(aReport());

  expect(html).toMatch(/href="\/snapshots\/s1\/issues"/);
});

it('lists the audits of the project with date and status, the failed one being disabled', async () => {
  const html = await (
    await render(
      () => Promise.resolve(aReport()),
      [
        aSnapshotListing({ id: 's1', startedAt: '2026-03-05T09:00:00.000Z' }),
        aSnapshotListing({ id: 's2', status: 'failed', startedAt: '2026-02-05T09:00:00.000Z' }),
        aSnapshotListing({ id: 's3', startedAt: '2026-01-05T09:00:00.000Z' }),
      ],
    )
  ).text();

  expect(html).toMatch(/<form[^>]*action="\/snapshots"[^>]*method="get"/i);
  expect(html).toMatch(/<option[^>]*value="s1"[^>]*selected[^>]*>[^<]*05\/03\/2026[^<]*terminé/);
  expect(html).toMatch(/<option[^>]*value="s2"[^>]*disabled[^>]*>[^<]*05\/02\/2026[^<]*échoué/);
  expect(html).toMatch(/<option[^>]*value="s3"[^>]*>[^<]*05\/01\/2026[^<]*terminé/);
  expect(html.match(/<option[^>]*disabled/g)).toHaveLength(1);
});

it('links to the pages screen and to the comparison of the project', async () => {
  const html = await (await render(() => Promise.resolve(aReport()))).text();

  expect(html).toContain('href="/snapshots/s1/pages"');
  expect(html).toContain('href="/projects/p1/compare"');
});

it('shows a zero health variation as "82 (0)" and not "820"', async () => {
  const html = await renderReport(aReport({ health: { score: 82, variation: 0 } }));

  expect(html).toMatch(/data-testid="health-score"[^>]*>\s*82 \(0\)\s*</);
  expect(html).not.toContain('820');
});

it('formats the theme scores like the health score', async () => {
  const html = await renderReport(
    aReport({ themes: { ...aReport().themes, 'on-page': { score: 70, variation: -2 } } }),
  );

  expect(html).toMatch(/data-testid="theme-on-page"[^]*?70 \(−2\)/);
});
