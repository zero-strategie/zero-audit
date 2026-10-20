import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, it } from 'vitest';
import ProjectsPage from '../src/pages/index.astro';
import { ApiUnreachable } from '../src/lib/api/errors';
import { aProject, fakeApiClient } from './fake-api-client';

const render = async (listProjects: () => Promise<ReturnType<typeof aProject>[]>) => {
  const container = await AstroContainer.create();
  return container.renderToResponse(ProjectsPage, {
    locals: { apiClient: fakeApiClient({ listProjects }) },
  });
};

it('lists each project with root URL, health, French date and a link to its latest snapshot', async () => {
  const response = await render(() =>
    Promise.resolve([
      aProject(),
      aProject({
        id: 'p2',
        rootUrl: 'https://beta.test/',
        latestSnapshot: { id: 's9', finishedAt: '2026-04-01T10:00:00.000Z', health: 55 },
      }),
    ]),
  );
  const html = await response.text();

  expect(html).toContain('https://alpha.test/');
  expect(html).toContain('82');
  expect(html).toContain('05/03/2026');
  expect(html).toMatch(/href="\/snapshots\/s1"/);
  expect(html).toContain('https://beta.test/');
  expect(html).toContain('01/04/2026');
  expect(html).toMatch(/href="\/snapshots\/s9"/);
});

it('links to the audit launch form', async () => {
  const html = await (await render(() => Promise.resolve([aProject()]))).text();

  expect(html).toMatch(/<a [^>]*href="\/audits\/new"[^>]*>\s*Nouvel audit/);
});

it('shows a running project as in progress with a link to its audit', async () => {
  const html = await (
    await render(() =>
      Promise.resolve([aProject({ latestRun: { id: 'r7', status: 'running', startedAt: '2026-03-06T09:00:00.000Z' } })]),
    )
  ).text();

  expect(html).toMatch(/<a [^>]*href="\/audits\/r7"[^>]*>\s*en cours…/);
});

it('shows a failed project as failed', async () => {
  const html = await (
    await render(() =>
      Promise.resolve([aProject({ latestRun: { id: 'r8', status: 'failed', startedAt: '2026-03-06T09:00:00.000Z' } })]),
    )
  ).text();

  expect(html).toContain('échoué');
});

it('offers a relaunch form posting the root URL with 100 pages', async () => {
  const html = await (await render(() => Promise.resolve([aProject()]))).text();

  expect(html).toMatch(/<form[^>]*action="\/audits\/new"[^]*?name="url" value="https:\/\/alpha.test\/"[^]*?name="limit" value="100"[^]*?Relancer/);
});

it('invites to run a first audit when there is no project', async () => {
  const html = await (await render(() => Promise.resolve([]))).text();

  expect(html).toContain("Aucun audit n'a encore été lancé");
  expect(html).toMatch(/<a [^>]*href="\/audits\/new"/);
  expect(html).not.toContain('pnpm zero-audit');
});

it('renders a 502 error page when the API is unreachable', async () => {
  const response = await render(() => Promise.reject(new ApiUnreachable('refused')));
  const html = await response.text();

  expect(response.status).toBe(502);
  expect(html).toContain("L'API ne répond pas");
  expect(html).toContain('ZERO_AUDIT_API_URL');
  expect(html).toContain('pnpm zero-audit serve');
});
