import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import ProjectsPage from '../src/pages/index.astro';
import OverviewPage from '../src/pages/snapshots/[id]/index.astro';
import IssuesPage from '../src/pages/snapshots/[id]/issues/index.astro';
import IssueDetailPage from '../src/pages/snapshots/[id]/issues/[checkId].astro';
import PagesPage from '../src/pages/snapshots/[id]/pages.astro';
import ComparePage from '../src/pages/projects/[id]/compare.astro';
import AuditPage from '../src/pages/audits/[id].astro';
import NewAuditPage from '../src/pages/audits/new.astro';
import {
  aCheckComparison,
  aComparison,
  anIssue,
  aPageRow,
  aProject,
  aReport,
  anAccount,
  aSnapshotListing,
  anAuditProgress,
  fakeApiClient,
} from './fake-api-client';

const apiClient = fakeApiClient({
  getAuditProgress: () => Promise.resolve(anAuditProgress()),
  listProjects: () => Promise.resolve([aProject()]),
  getSnapshotReport: () => Promise.resolve(aReport()),
  listProjectSnapshots: () =>
    Promise.resolve([aSnapshotListing({ id: 's1' }), aSnapshotListing({ id: 's2' })]),
  listIssues: () => Promise.resolve([anIssue()]),
  getOccurrences: () =>
    Promise.resolve({
      items: [{ pageUrl: 'https://alpha.test/a', info: {} }],
      total: 1,
      page: 1,
      limit: 50,
    }),
  listPages: () => Promise.resolve({ items: [aPageRow()], total: 1, page: 1, limit: 50 }),
  compare: () =>
    Promise.resolve(
      aComparison({ checks: [aCheckComparison({ countA: 1, countB: 2, delta: 1 })] }),
    ),
});

const SCREENS = [
  { name: 'projects', component: ProjectsPage, url: '/', params: {}, table: true },
  {
    name: 'overview',
    component: OverviewPage,
    url: '/snapshots/s1',
    params: { id: 's1' },
    table: false,
  },
  {
    name: 'issues',
    component: IssuesPage,
    url: '/snapshots/s1/issues',
    params: { id: 's1' },
    table: false,
  },
  {
    name: 'issue detail',
    component: IssueDetailPage,
    url: '/snapshots/s1/issues/15',
    params: { id: 's1', checkId: '15' },
    table: false,
  },
  {
    name: 'pages',
    component: PagesPage,
    url: '/snapshots/s1/pages',
    params: { id: 's1' },
    table: true,
  },
  {
    name: 'compare',
    component: ComparePage,
    url: '/projects/p1/compare?a=s1&b=s2',
    params: { id: 'p1' },
    table: true,
  },
  { name: 'new audit', component: NewAuditPage, url: '/audits/new', params: {}, table: false },
  {
    name: 'audit progress',
    component: AuditPage,
    url: '/audits/s2',
    params: { id: 's2' },
    table: false,
  },
] as const;

const SCREENS_WITH_TABLE = SCREENS.filter(({ table }) => table);
const SNAPSHOT_SCREENS = SCREENS.filter(({ url }) => url.startsWith('/snapshots/'));

const render = async (screen: (typeof SCREENS)[number]) => {
  const container = await AstroContainer.create();
  const response = await container.renderToResponse(screen.component, {
    params: screen.params,
    request: new Request(`http://localhost${screen.url}`),
    locals: { apiClient, user: anAccount() },
  });
  return response.text();
};

// The Astro container does not resolve asset URLs, so the link target is checked in the source.
it('links the layout to the global stylesheet', () => {
  const layout = readFileSync(new URL('../src/layouts/Layout.astro', import.meta.url), 'utf8');

  expect(layout).toMatch(/import \w+ from '..\/styles\/global\.css\?url'/);
  expect(layout).toMatch(/<link rel="stylesheet" href=\{\w+\}/);
});

describe.each(SCREENS)('$name screen', (screen) => {
  it('declares the viewport, the color scheme and the global stylesheet', async () => {
    const html = await render(screen);

    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    expect(html).toMatch(/<link[^>]+rel="stylesheet"/);
  });

  it('shows the common navigation with a link to the projects list', async () => {
    const html = await render(screen);

    expect(html).toMatch(/<nav[^>]*data-testid="main-nav"[^>]*>[\s\S]*?href="\/"/);
  });

  it('offers the source code and states the licence in the footer (AGPL-3.0 section 13)', async () => {
    const html = await render(screen);

    expect(html).toMatch(
      /<footer[^>]*data-testid="site-footer"[^>]*>[\s\S]*AGPL-3\.0[\s\S]*href="https:\/\/github\.com\/zero-strategie\/zero-audit"[\s\S]*<\/footer>/,
    );
  });

  it('ships no client-side script', async () => {
    expect(await render(screen)).not.toContain('<script');
  });
});

describe.each(SCREENS_WITH_TABLE)('$name screen table', (screen) => {
  it('is wrapped in a horizontally scrollable container', async () => {
    expect(await render(screen)).toMatch(/<div class="table-scroll"[^>]*>\s*<table/);
  });
});

describe('snapshot navigation', () => {
  it.each(SNAPSHOT_SCREENS)(
    'links to overview, issues and pages from the $name screen',
    async (screen) => {
      const html = await render(screen);

      expect(html).toMatch(/data-testid="main-nav"[\s\S]*href="\/snapshots\/s1"/);
      expect(html).toMatch(/data-testid="main-nav"[\s\S]*href="\/snapshots\/s1\/issues"/);
      expect(html).toMatch(/data-testid="main-nav"[\s\S]*href="\/snapshots\/s1\/pages"/);
    },
  );

  it.each(SNAPSHOT_SCREENS)('links to the comparison from the $name screen', async (screen) => {
    const html = await render(screen);

    expect(html).toMatch(
      /data-testid="main-nav"[\s\S]*href="\/(projects\/p1|snapshots\/s1)\/compare"/,
    );
  });

  it('links to the comparison of the project from the overview', async () => {
    const html = await render(SCREENS[1]);

    expect(html).toMatch(/data-testid="main-nav"[\s\S]*href="\/projects\/p1\/compare"/);
  });
});
