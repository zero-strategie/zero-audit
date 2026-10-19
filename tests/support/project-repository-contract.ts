import { describe, expect, it } from 'vitest';
import type { ProjectRepository } from '../../src/application/ports/project-repository.js';

const createdAt = new Date('2026-01-01T10:00:00.123Z');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const describeProjectRepositoryContract = (
  factory: () => Promise<ProjectRepository> | ProjectRepository,
): void => {
  describe('ProjectRepository contract', () => {
    it('creates a project with a UUID, its root URL and its creation date', async () => {
      const repo = await factory();
      const project = await repo.findOrCreateByRootUrl({ rootUrl: 'https://x.test/', createdAt });
      expect(project.id).toMatch(UUID);
      expect(project).toMatchObject({ rootUrl: 'https://x.test/', createdAt });
      expect(await repo.getById(project.id)).toEqual(project);
    });

    it('returns the existing project for the same root URL', async () => {
      const repo = await factory();
      const first = await repo.findOrCreateByRootUrl({ rootUrl: 'https://x.test/', createdAt });
      const second = await repo.findOrCreateByRootUrl({
        rootUrl: 'https://x.test/',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      expect(second).toEqual(first);
      expect(await repo.list()).toHaveLength(1);
    });

    it('keeps http, https and www variants as distinct projects', async () => {
      const repo = await factory();
      const urls = ['https://x.test/', 'http://x.test/', 'https://www.x.test/'];
      for (const rootUrl of urls) await repo.findOrCreateByRootUrl({ rootUrl, createdAt });
      expect((await repo.list()).map((project) => project.rootUrl).sort()).toEqual(
        [...urls].sort(),
      );
    });

    it('returns null for an unknown project id', async () => {
      const repo = await factory();
      expect(await repo.getById('missing')).toBeNull();
    });
  });
};
