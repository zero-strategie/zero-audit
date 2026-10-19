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

it('invites to run a first audit when there is no project', async () => {
  const html = await (await render(() => Promise.resolve([]))).text();

  expect(html).toContain("Aucun audit n'a encore été lancé");
  expect(html).toContain('pnpm zero-audit &lt;url&gt;');
});

it('renders a 502 error page when the API is unreachable', async () => {
  const response = await render(() => Promise.reject(new ApiUnreachable('refused')));
  const html = await response.text();

  expect(response.status).toBe(502);
  expect(html).toContain("L'API ne répond pas");
  expect(html).toContain('ZERO_AUDIT_API_URL');
  expect(html).toContain('pnpm zero-audit serve');
});
