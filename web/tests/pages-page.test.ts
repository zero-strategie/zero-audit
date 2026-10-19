import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, it } from 'vitest';
import PagesPage from '../src/pages/snapshots/[id]/pages.astro';
import { ApiUnreachable, NotFound } from '../src/lib/api/errors';
import type { PageListing } from '../src/lib/api/types';
import { aPageRow, fakeApiClient } from './fake-api-client';

interface Call {
  page: number;
  sort: string;
}

const listing = (overrides: Partial<PageListing> = {}): PageListing => ({
  items: Array.from({ length: 50 }, (_, index) =>
    aPageRow({ url: `https://alpha.test/p${String(index)}` }),
  ),
  total: 120,
  page: 1,
  limit: 50,
  ...overrides,
});

const render = async (result: PageListing | Error, query = '', calls: Call[] = []) => {
  const container = await AstroContainer.create();
  return container.renderToResponse(PagesPage, {
    params: { id: 's1' },
    request: new Request(`http://localhost/snapshots/s1/pages${query}`),
    locals: {
      apiClient: fakeApiClient({
        listPages: (_id, page, sort) => {
          calls.push({ page, sort });
          return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
        },
      }),
    },
  });
};

it('shows the 50 rows with status, depth, group, issues and response time', async () => {
  const calls: Call[] = [];
  const html = await (
    await render(
      listing({
        items: [
          aPageRow({
            url: 'https://alpha.test/a',
            status: 404,
            depth: 2,
            group: 'broken',
            issues: 3,
            responseTimeMs: 250,
          }),
        ],
      }),
      '',
      calls,
    )
  ).text();

  expect(calls).toEqual([{ page: 1, sort: 'url' }]);
  expect(html).toMatch(
    /data-testid="row-https:\/\/alpha.test\/a"[^]*?404[^]*?>\s*2\s*<[^]*?Pages cassées[^]*?>\s*3\s*<[^]*?250 ms/,
  );
});

it('links to the next page and keeps the sort', async () => {
  const html = await (await render(listing(), '?sort=-depth')).text();

  expect(html).toContain('href="?page=2&amp;sort=-depth"');
  expect(html).not.toContain('data-testid="previous"');
});

it('makes the Statut header sort ascending, then descending', async () => {
  const first = await (await render(listing())).text();
  const second = await (await render(listing(), '?sort=status')).text();

  expect(first).toMatch(/href="\?sort=status"[^>]*>\s*Statut/);
  expect(second).toMatch(/href="\?sort=-status"[^>]*>\s*Statut/);
});

it('shows a message and falls back to the URL sort when the sort is unknown', async () => {
  const calls: Call[] = [];
  const response = await render(listing(), '?sort=inconnu', calls);
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(calls).toEqual([{ page: 1, sort: 'url' }]);
  expect(html).toMatch(/data-testid="invalid-sort"[^]*?inconnu/);
});

it('renders the not-found page with status 404 for an unknown snapshot', async () => {
  expect((await render(new NotFound('Snapshot'))).status).toBe(404);
});

it('renders the API error page with status 502 when the API is down', async () => {
  expect((await render(new ApiUnreachable('down'))).status).toBe(502);
});

it('links back to the overview and the issues screen', async () => {
  const html = await (await render(listing())).text();

  expect(html).toContain('href="/snapshots/s1"');
  expect(html).toContain('href="/snapshots/s1/issues"');
});
