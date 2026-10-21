import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import ProjectsPage from '../src/pages/index.astro';
import { ApiUnreachable } from '../src/lib/api/errors';
import type { CurrentAccount } from '../src/lib/api/types';
import { anAccount, aProject, fakeApiClient } from './fake-api-client';

const render = async (
  listProjects: () => Promise<ReturnType<typeof aProject>[]>,
  user: CurrentAccount | null = anAccount(),
) => {
  const container = await AstroContainer.create();
  return container.renderToResponse(ProjectsPage, {
    locals: { apiClient: fakeApiClient({ listProjects }), user },
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

it('names the site in each relaunch button for screen readers', async () => {
  const html = await (await render(() => Promise.resolve([aProject()]))).text();

  expect(html).toContain(`aria-label="Relancer l'audit de alpha.test"`);
});

it('invites a signed-in account without project of its own to run a first audit', async () => {
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

describe('for an anonymous visitor', () => {
  const anonymous = async (projects = [aProject()]) =>
    (await render(() => Promise.resolve(projects), null)).text();

  it('lists the showcase projects', async () => {
    const html = await anonymous();

    expect(html).toContain('Vitrine');
    expect(html).toContain('https://alpha.test/');
    expect(html).toMatch(/href="\/snapshots\/s1"/);
  });

  it('offers to create an account and shows no relaunch button', async () => {
    const html = await anonymous();

    expect(html).toMatch(/<a [^>]*href="\/inscription"/);
    expect(html).not.toContain('Relancer');
    expect(html).not.toMatch(/action="\/audits\/new"/);
  });

  it('says the showcase is empty when it has no project', async () => {
    const html = await anonymous([]);

    expect(html).toContain('La vitrine est vide');
    expect(html).toMatch(/href="\/inscription"/);
  });
});

describe('for a signed-in account', () => {
  const projects = [
    aProject({ id: 'mine', rootUrl: 'https://mine.test/', owned: true }),
    aProject({ id: 'shared', rootUrl: 'https://showcase.test/' }),
  ];

  it('puts "Mes projets" before the showcase, each project in its own section', async () => {
    const html = await (await render(() => Promise.resolve(projects))).text();

    const mine = html.indexOf('Mes projets');
    const showcase = html.indexOf('Vitrine');
    expect(mine).toBeGreaterThan(-1);
    expect(showcase).toBeGreaterThan(mine);
    expect(html.indexOf('https://mine.test/')).toBeLessThan(showcase);
    expect(html.indexOf('https://showcase.test/')).toBeGreaterThan(showcase);
  });

  it('offers the relaunch button on both sections', async () => {
    const html = await (await render(() => Promise.resolve(projects))).text();

    expect(html).toContain(`aria-label="Relancer l'audit de mine.test"`);
    expect(html).toContain(`aria-label="Relancer l'audit de showcase.test"`);
  });

  it('does not offer to create an account', async () => {
    const html = await (await render(() => Promise.resolve(projects))).text();

    expect(html).not.toMatch(/href="\/inscription"/);
  });
});
