import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, it } from 'vitest';
import AuditPage from '../src/pages/audits/[id].astro';
import { NotFound } from '../src/lib/api/errors';
import type { AuditProgress } from '../src/lib/api/types';
import { anAuditProgress, fakeApiClient } from './fake-api-client';

const render = async (progress: Promise<AuditProgress>) => {
  const container = await AstroContainer.create();
  return container.renderToResponse(AuditPage, {
    params: { id: 's2' },
    request: new Request('http://localhost/audits/s2'),
    locals: { apiClient: fakeApiClient({ getAuditProgress: () => progress }) },
  });
};

it('shows the progress of a running audit, a CSS bar and a 3 second refresh', async () => {
  const html = await (await render(Promise.resolve(anAuditProgress()))).text();

  expect(html).toContain('Audit de alpha.test en cours — 12 / 100 pages');
  expect(html).toMatch(/<div class="progress"[^>]*>\s*<div class="progress-bar" style="width: 12%/);
  expect(html).toContain('<meta http-equiv="refresh" content="3">');
});

it('shows only "en cours" when no page has been counted yet', async () => {
  const html = await (await render(Promise.resolve(anAuditProgress({ pagesCrawled: 0 })))).text();

  expect(html).toContain('Audit de alpha.test en cours');
  expect(html).not.toMatch(/\d+ \/ \d+ pages/);
  expect(html).not.toContain('class="progress"');
  expect(html).toContain('<meta http-equiv="refresh" content="3">');
});

it('redirects a finished audit to its overview with 303', async () => {
  const response = await render(Promise.resolve(anAuditProgress({ status: 'finished' })));

  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/snapshots/s2');
});

it('renders the dashboard 404 page for an unknown audit', async () => {
  const response = await render(Promise.reject(new NotFound('snapshot')));

  expect(response.status).toBe(404);
  expect(await response.text()).toContain('Audit introuvable');
});

it('offers to relaunch a failed audit with its root URL and limit, without refresh', async () => {
  const html = await (
    await render(Promise.resolve(anAuditProgress({ status: 'failed', pagesLimit: 250 })))
  ).text();

  expect(html).toContain('a échoué');
  expect(html).toMatch(/<form[^>]+method="post"[^>]+action="\/audits\/new"/);
  expect(html).toMatch(/name="url" value="https:\/\/alpha.test\/"/);
  expect(html).toMatch(/name="limit" value="250"/);
  expect(html).toContain('Relancer');
  expect(html).not.toContain('http-equiv="refresh"');
});

it('relaunches with 100 pages when the failed audit used an unlisted limit', async () => {
  const html = await (
    await render(Promise.resolve(anAuditProgress({ status: 'failed', pagesLimit: 75 })))
  ).text();

  expect(html).toMatch(/name="limit" value="100"/);
});
