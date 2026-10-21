import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, it } from 'vitest';
import ComparePage from '../src/pages/projects/[id]/compare.astro';
import { InvalidRequest, NotFound } from '../src/lib/api/errors';
import type { Comparison } from '../src/lib/api/types';
import { aCheckComparison, aComparison, aSnapshotListing, fakeApiClient } from './fake-api-client';

const snapshots = [
  aSnapshotListing({ id: 's1', startedAt: '2026-01-05T09:00:00.000Z' }),
  aSnapshotListing({ id: 's2', startedAt: '2026-02-05T09:00:00.000Z' }),
  aSnapshotListing({ id: 's3', status: 'failed', startedAt: '2026-03-05T09:00:00.000Z' }),
];

const render = async (
  result: Comparison | Error,
  query = '?a=s1&b=s2',
  calls: string[][] = [],
  listing = snapshots,
) => {
  const container = await AstroContainer.create();
  return container.renderToResponse(ComparePage, {
    params: { id: 'p1' },
    request: new Request(`http://localhost/projects/p1/compare${query}`),
    locals: {
      apiClient: fakeApiClient({
        listProjectSnapshots: () => Promise.resolve(listing),
        compare: (a, b) => {
          calls.push([a, b]);
          return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
        },
      }),
    },
  });
};

const changed = aComparison({
  health: { score: 80, variation: -3 },
  themes: { ...aComparison().themes, linking: { score: 70, variation: 5 } },
  checks: [
    aCheckComparison({
      checkId: 15,
      countA: 5,
      countB: 8,
      delta: 3,
      newCount: 4,
      fixedCount: 1,
    }),
    aCheckComparison({ checkId: 16, label: 'Inchangé' }),
  ],
});

it('shows the variation of the health and of the themes', async () => {
  const html = await (await render(changed)).text();

  expect(html).toMatch(/data-testid="health-score"[^>]*>\s*80 \(\u22123\)\s*</);
  expect(html).toMatch(/data-testid="theme-linking"[^]*?70 \(\+5\)/);
  expect(html).not.toMatch(/\b800\b|\b705\b/);
});

it('shows countA, countB, delta, new and fixed occurrences per changed check', async () => {
  const html = await (await render(changed)).text();

  expect(html).toMatch(/data-testid="check-15"[^]*?data-testid="count-a"[^>]*>\s*5\s*</);
  expect(html).toMatch(/data-testid="check-15"[^]*?data-testid="count-b"[^>]*>\s*8\s*</);
  expect(html).toMatch(/data-testid="check-15"[^]*?data-testid="delta"[^>]*>\s*\+3\s*</);
  expect(html).toMatch(/data-testid="check-15"[^]*?data-testid="new"[^>]*>\s*4\s*</);
  expect(html).toMatch(/data-testid="check-15"[^]*?data-testid="fixed"[^>]*>\s*1\s*</);
  expect(html).not.toContain('data-testid="check-16"');
});

it('says that no difference was found for identical audits', async () => {
  const html = await (await render(aComparison({ checks: [aCheckComparison()] }))).text();

  expect(html).toContain('data-testid="no-difference"');
  expect(html).not.toContain('data-testid="check-15"');
});

it('compares A as base and B as target', async () => {
  const calls: string[][] = [];
  await render(changed, '?a=s2&b=s1', calls);

  expect(calls).toEqual([['s2', 's1']]);
});

it('defaults to the previous finished audit against the latest finished one', async () => {
  const calls: string[][] = [];
  await render(changed, '', calls);

  expect(calls).toEqual([['s1', 's2']]);
});

it('explains that two finished audits are needed when there is no default pair', async () => {
  const container = await AstroContainer.create();
  const response = await container.renderToResponse(ComparePage, {
    params: { id: 'p1' },
    request: new Request('http://localhost/projects/p1/compare'),
    locals: {
      apiClient: fakeApiClient({
        listProjectSnapshots: () => Promise.resolve([aSnapshotListing()]),
      }),
    },
  });

  expect(response.status).toBe(200);
  expect(await response.text()).toContain('data-testid="not-enough-snapshots"');
});

it('offers the finished audits for A and B and disables the failed one', async () => {
  const html = await (await render(changed)).text();

  expect(html).toMatch(/<select[^>]*name="a"[^]*?<\/select>/);
  expect(html).toMatch(/<select[^>]*name="b"[^]*?<\/select>/);
  expect(html).toMatch(/<option[^>]*value="s3"[^>]*disabled/);
});

it('shows the API message and answers 400 when the comparison is refused', async () => {
  const response = await render(new InvalidRequest('Audits de projets différents'));

  expect(response.status).toBe(400);
  expect(await response.text()).toMatch(
    /data-testid="compare-error"[^]*?Audits de projets différents/,
  );
});

it('renders the not-found page with status 404 for an unknown audit', async () => {
  const response = await render(new NotFound('Snapshot'), '?a=inconnu&b=s2');

  expect(response.status).toBe(404);
  expect(await response.text()).toContain('introuvable');
});

it('draws the health gauge and theme cards with the variation format', async () => {
  const html = await (await render(aComparison({ health: { score: 77, variation: 3 } }))).text();

  expect(html).toContain('class="health-gauge"');
  expect(html).toContain('class="theme-card"');
  expect(html).toMatch(/data-testid="health-score"[^>]*>\s*77 \(\+3\)\s*</);
  expect(html).not.toContain('770');
});

it.each([
  [74, />\s*74\s*</],
  [null, />\s*Non calculable\s*</],
])('shows the health %s of audit A next to the health of audit B', async (healthA, expected) => {
  const listing = [aSnapshotListing({ id: 's1', health: healthA }), aSnapshotListing({ id: 's2' })];
  const html = await (
    await render(aComparison({ health: { score: 77, variation: 3 } }), '?a=s1&b=s2', [], listing)
  ).text();

  expect(html).toMatch(new RegExp(`data-testid="health-score-a"[^>]*${expected.source}`));
  expect(html).toMatch(/data-testid="health-score"[^>]*>\s*77 \(\+3\)\s*</);
  expect(html).not.toContain('770');
});

it('marks each change as worse or better, with an arrow drawn in CSS, not by color alone', async () => {
  const html = await (await render(changed)).text();

  expect(html).toMatch(
    /data-testid="check-15"[^]*?<td(?=[^>]*class="delta delta-worse")(?=[^>]*data-testid="delta")[^>]*>\s*\+3\s*</,
  );
});
