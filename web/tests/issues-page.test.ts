import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, it } from 'vitest';
import IssuesPage from '../src/pages/snapshots/[id]/issues/index.astro';
import { NotFound } from '../src/lib/api/errors';
import type { IssueRow, Severity } from '../src/lib/api/types';
import { anIssue, fakeApiClient } from './fake-api-client';

const render = async (
  rows: IssueRow[] | Error,
  query = '',
  calls: (Severity | undefined)[] = [],
) => {
  const container = await AstroContainer.create();
  return container.renderToResponse(IssuesPage, {
    params: { id: 's1' },
    request: new Request(`http://localhost/snapshots/s1/issues${query}`),
    locals: {
      apiClient: fakeApiClient({
        listIssues: (_id, severity) => {
          calls.push(severity);
          return rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows);
        },
      }),
    },
  });
};

const rows = [
  anIssue({
    checkId: 1,
    label: 'Pages en erreur',
    severity: 'error',
    count: 4,
    delta: -2,
    newCount: 1,
  }),
  anIssue({ checkId: 15, severity: 'warning', count: 7, delta: 2, newCount: 3 }),
  anIssue({
    checkId: 101,
    label: 'Titres trop longs',
    severity: 'notice',
    count: 0,
    delta: 0,
    newCount: 0,
  }),
];

it('groups checks under Erreurs, Avertissements and Notices', async () => {
  const html = await (await render(rows)).text();

  expect(html).toMatch(/data-testid="group-error"[^]*?Erreurs[^]*?Pages en erreur/);
  expect(html).toMatch(
    /data-testid="group-warning"[^]*?Avertissements[^]*?Même meta description sur plusieurs pages/,
  );
  expect(html).toMatch(/data-testid="group-notice"[^]*?Notices[^]*?Titres trop longs/);
});

it('shows count, signed delta and new occurrences of a check with a detail link', async () => {
  const html = await (await render(rows)).text();

  expect(html).toMatch(/data-testid="issue-15"[^]*?data-testid="count"[^>]*>\s*7\s*</);
  expect(html).toMatch(/data-testid="issue-15"[^]*?data-testid="delta"[^>]*>\s*\+2\s*</);
  expect(html).toMatch(/data-testid="issue-15"[^]*?data-testid="new"[^>]*>\s*3\s*</);
  expect(html).toMatch(/data-testid="issue-1"[^]*?data-testid="delta"[^>]*>\s*-2\s*</);
  expect(html).toContain('href="/snapshots/s1/issues/15"');
});

it('shows a check with no occurrence as passed, without a detail link', async () => {
  const html = await (await render(rows)).text();

  expect(html).toMatch(/data-testid="issue-101"[^]*?Réussi/);
  expect(html).not.toContain('/issues/101');
});

it('asks the API for the severity given in the URL', async () => {
  const calls: (Severity | undefined)[] = [];
  await render([rows[0] as IssueRow], '?severity=error', calls);

  expect(calls).toEqual(['error']);
});

it('shows a message and all checks when the severity filter is invalid', async () => {
  const calls: (Severity | undefined)[] = [];
  const html = await (await render(rows, '?severity=autre', calls)).text();

  expect(calls).toEqual([undefined]);
  expect(html).toMatch(/data-testid="invalid-filter"[^]*?autre/);
  expect(html).toContain('Pages en erreur');
});

it('renders the not-found page with status 404 for an unknown snapshot', async () => {
  const response = await render(new NotFound('Snapshot'));

  expect(response.status).toBe(404);
});
