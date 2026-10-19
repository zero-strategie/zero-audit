import { describe, expect, it } from 'vitest';
import { ListPages } from '../../src/application/list-pages.js';
import { SnapshotNotFound } from '../../src/domain/errors.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { makePage } from '../support/check-fixtures.js';

const setup = async () => {
  const repository = new InMemorySnapshotRepository();
  const { id } = await repository.create({
    projectId: 'p',
    pagesLimit: 10,
    startedAt: new Date(Date.UTC(2026, 0, 1)),
  });
  await repository.addPages(id, [
    makePage('https://e.com/b', { status: 200, depth: 1, responseTimeMs: 300 }),
    makePage('https://e.com/a', { status: 404, depth: 2, responseTimeMs: 100 }),
    makePage('https://e.com/c', { status: 200, depth: 0, responseTimeMs: 200 }),
  ]);
  await repository.addCheckResults(id, [
    {
      checkId: 2,
      severity: 'error',
      theme: 'crawlability',
      count: 2,
      examined: 3,
      occurrences: [
        { checkId: 2, pageUrl: 'https://e.com/a', info: {} },
        { checkId: 2, pageUrl: 'https://e.com/a', info: { x: 1 } },
      ],
    },
  ]);
  return { id, useCase: new ListPages(repository) };
};

const urls = (items: readonly { url: string }[]): string[] =>
  items.map(({ url }) => url.replace('https://e.com/', ''));

describe('ListPages', () => {
  it('exposes url, status, depth, group, canonical, issues and response time', async () => {
    const { id, useCase } = await setup();

    const { items } = await useCase.execute(id, { sort: 'url', page: 1, limit: 50 });

    expect(items[0]).toEqual({
      url: 'https://e.com/a',
      status: 404,
      depth: 2,
      group: 'broken',
      canonical: null,
      issues: 2,
      responseTimeMs: 100,
    });
  });

  it.each([
    ['url', ['a', 'b', 'c']],
    ['-url', ['c', 'b', 'a']],
    ['-status', ['a', 'b', 'c']],
    ['status', ['b', 'c', 'a']],
    ['depth', ['c', 'b', 'a']],
    ['-issues', ['a', 'b', 'c']],
    ['responseTime', ['a', 'c', 'b']],
    ['-responseTime', ['b', 'c', 'a']],
  ] as const)('sorts by %s', async (sort, expected) => {
    const { id, useCase } = await setup();

    const { items } = await useCase.execute(id, { sort, page: 1, limit: 50 });

    expect(urls(items)).toEqual(expected);
  });

  it('paginates after sorting', async () => {
    const { id, useCase } = await setup();

    const result = await useCase.execute(id, { sort: 'url', page: 2, limit: 2 });

    expect(urls(result.items)).toEqual(['c']);
    expect(result).toMatchObject({ total: 3, page: 2, limit: 2 });
  });

  it('fails for an unknown snapshot', async () => {
    const { useCase } = await setup();

    await expect(useCase.execute('nope', { sort: 'url', page: 1, limit: 50 })).rejects.toThrow(
      SnapshotNotFound,
    );
  });
});
