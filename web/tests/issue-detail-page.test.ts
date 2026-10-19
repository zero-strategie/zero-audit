import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, it } from 'vitest';
import DetailPage from '../src/pages/snapshots/[id]/issues/[checkId].astro';
import { NotFound } from '../src/lib/api/errors';
import type { OccurrencePage } from '../src/lib/api/types';
import { anIssue, fakeApiClient } from './fake-api-client';

const occurrences = (count: number, page: number, total: number): OccurrencePage => ({
  items: Array.from({ length: count }, (_, index) => ({
    pageUrl: `https://a.test/p${String(page)}-${String(index)}`,
    info: { status: 404 },
  })),
  total,
  page,
  limit: 50,
});

const render = async (
  result: OccurrencePage | Error,
  { query = '', checkId = '15', calls = [] as number[] } = {},
) => {
  const container = await AstroContainer.create();
  return container.renderToResponse(DetailPage, {
    params: { id: 's1', checkId },
    request: new Request(`http://localhost/snapshots/s1/issues/${checkId}${query}`),
    locals: {
      apiClient: fakeApiClient({
        getOccurrences: (_id, _checkId, page) => {
          calls.push(page);
          return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
        },
      }),
    },
  });
};

const countRows = (html: string) => html.match(/data-testid="occurrence"/g)?.length ?? 0;

it('shows 50 occurrences with url and readable info on page 1 of 120, with only a next link', async () => {
  const html = await (await render(occurrences(50, 1, 120))).text();

  expect(countRows(html)).toBe(50);
  expect(html).toContain('https://a.test/p1-0');
  expect(html).toContain('Code HTTP : 404');
  expect(html).toContain('href="?page=2"');
  expect(html).not.toContain('data-testid="previous-page"');
});

it('shows 20 occurrences on page 3 with only a previous link', async () => {
  const html = await (await render(occurrences(20, 3, 120), { query: '?page=3' })).text();

  expect(countRows(html)).toBe(20);
  expect(html).toContain('href="?page=2"');
  expect(html).not.toContain('data-testid="next-page"');
});

it('requests the page given in the URL', async () => {
  const calls: number[] = [];
  await render(occurrences(20, 3, 120), { query: '?page=3', calls });

  expect(calls).toEqual([3]);
});

it('falls back to page 1 when ?page is not a number', async () => {
  const calls: number[] = [];
  const response = await render(occurrences(50, 1, 120), { query: '?page=abc', calls });

  expect(response.status).toBe(200);
  expect(calls).toEqual([1]);
});

it('shows the site-level occurrence without a page url', async () => {
  const html = await (
    await render({ items: [{ pageUrl: null, info: {} }], total: 1, page: 1, limit: 50 })
  ).text();

  expect(countRows(html)).toBe(1);
  expect(html).toContain('Ensemble du site');
});

it('renders the not-found page with status 404 for an unknown check or snapshot', async () => {
  const response = await render(new NotFound('Issue'));

  expect(response.status).toBe(404);
  expect(await response.text()).toContain('introuvable');
});

it('renders the not-found page with status 404 for a non numeric check id without calling the API', async () => {
  const calls: number[] = [];
  const response = await render(occurrences(1, 1, 1), { checkId: 'abc', calls });

  expect(response.status).toBe(404);
  expect(calls).toEqual([]);
});

it('shows the severity badge of the checked issue', async () => {
  const container = await AstroContainer.create();
  const response = await container.renderToResponse(DetailPage, {
    params: { id: 's1', checkId: '15' },
    request: new Request('http://localhost/snapshots/s1/issues/15'),
    locals: {
      apiClient: fakeApiClient({
        getOccurrences: () => Promise.resolve(occurrences(1, 1, 1)),
        listIssues: () => Promise.resolve([anIssue({ checkId: 15, severity: 'error' })]),
      }),
    },
  });

  expect(await response.text()).toContain('severity-badge severity-error');
});

it('still shows the occurrences without a badge when the issues cannot be listed', async () => {
  const container = await AstroContainer.create();
  const response = await container.renderToResponse(DetailPage, {
    params: { id: 's1', checkId: '15' },
    request: new Request('http://localhost/snapshots/s1/issues/15'),
    locals: {
      apiClient: fakeApiClient({
        getOccurrences: () => Promise.resolve(occurrences(2, 1, 2)),
        listIssues: () => Promise.reject(new Error('down')),
      }),
    },
  });
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(countRows(html)).toBe(2);
  expect(html).not.toContain('severity-badge');
});
