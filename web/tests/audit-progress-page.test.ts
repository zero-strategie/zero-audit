import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, it } from 'vitest';
import AuditPage from '../src/pages/audits/[id].astro';
import { NotFound } from '../src/lib/api/errors';
import type { AuditProgress, CurrentAccount } from '../src/lib/api/types';
import { anAccount, anAuditProgress, fakeApiClient } from './fake-api-client';

const render = async (
  progress: Promise<AuditProgress>,
  user: CurrentAccount | null = anAccount(),
) => {
  const container = await AstroContainer.create();
  return container.renderToResponse(AuditPage, {
    params: { id: 's2' },
    request: new Request('http://localhost/audits/s2'),
    locals: { apiClient: fakeApiClient({ getAuditProgress: () => progress }), user },
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

it('shows no relaunch form to an anonymous visitor of a failed audit', async () => {
  const html = await (
    await render(Promise.resolve(anAuditProgress({ status: 'failed' })), null)
  ).text();

  expect(html).toContain('a échoué');
  expect(html).not.toContain('Relancer');
  expect(html).not.toContain('action="/audits/new"');
});

it('shows the queue position of a queued audit with a refresh', async () => {
  const html = await (
    await render(
      Promise.resolve(anAuditProgress({ status: 'queued', pagesCrawled: 0, queuePosition: 2 })),
    )
  ).text();

  expect(html).toContain('En file d&#39;attente — position 2');
  expect(html).toContain('<meta http-equiv="refresh" content="3">');
  expect(html).not.toContain('Audit interrompu');
  expect(html).not.toContain('Reprise en cours');
  expect(html).not.toContain('a échoué');
});

it('announces the resumption of a running audit on its second attempt', async () => {
  const html = await (await render(Promise.resolve(anAuditProgress({ attempts: 2 })))).text();

  expect(html).toContain('Reprise en cours (tentative 2/2)');
  expect(html).toContain('<meta http-equiv="refresh" content="3">');
});

it('shows both the position and the resumption for a requeued audit', async () => {
  const html = await (
    await render(
      Promise.resolve(
        anAuditProgress({ status: 'queued', pagesCrawled: 0, queuePosition: 1, attempts: 2 }),
      ),
    )
  ).text();

  expect(html).toContain('position 1');
  expect(html).toContain('Reprise en cours (tentative 2/2)');
});

it.each(['running', 'queued'] as const)(
  'mentions no resumption for a first attempt (%s)',
  async (status) => {
    const html = await (
      await render(
        Promise.resolve(anAuditProgress({ status, queuePosition: status === 'queued' ? 3 : null })),
      )
    ).text();

    expect(html).not.toContain('Reprise en cours');
  },
);

it('adds no script to the progress page', async () => {
  const html = await (
    await render(
      Promise.resolve(anAuditProgress({ status: 'queued', queuePosition: 2, attempts: 2 })),
    )
  ).text();

  expect(html).not.toContain('<script');
});
