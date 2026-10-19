import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, it } from 'vitest';
import OverviewPage from '../src/pages/snapshots/[id]/index.astro';
import { ApiUnreachable, NotFound } from '../src/lib/api/errors';
import type { SnapshotReport } from '../src/lib/api/types';
import { aReport, fakeApiClient } from './fake-api-client';

const render = async (getSnapshotReport: (id: string) => Promise<SnapshotReport>) => {
  const container = await AstroContainer.create();
  return container.renderToResponse(OverviewPage, {
    params: { id: 's1' },
    locals: { apiClient: fakeApiClient({ getSnapshotReport }) },
  });
};

const renderReport = async (report: SnapshotReport) =>
  (await render(() => Promise.resolve(report))).text();

it('shows the health score and its variation', async () => {
  const html = await renderReport(aReport());

  expect(html).toMatch(/data-testid="health-score"[^>]*>\s*82\s*</);
  expect(html).toMatch(/data-testid="health-variation"[^>]*>\s*\+2\s*</);
});

it('shows a dash when the health variation is null', async () => {
  const html = await renderReport(aReport({ health: { score: 82, variation: null } }));

  expect(html).toMatch(/data-testid="health-variation"[^>]*>\s*—\s*</);
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
