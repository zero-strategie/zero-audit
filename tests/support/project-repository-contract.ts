import { describe, expect, it } from 'vitest';
import type { ProjectRepository } from '../../src/application/ports/project-repository.js';
import type { LegacyAccounts } from './legacy-accounts.js';

const createdAt = new Date('2026-01-01T10:00:00.123Z');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface ProjectStorage {
  readonly projects: ProjectRepository;
  readonly accounts: LegacyAccounts;
}

export const describeProjectRepositoryContract = (
  factory: () => Promise<ProjectStorage> | ProjectStorage,
): void => {
  describe('ProjectRepository contract', () => {
    it('creates a project with a UUID, its root URL and its creation date', async () => {
      const { projects: repo } = await factory();
      const project = await repo.findOrCreateByRootUrl({
        rootUrl: 'https://x.test/',
        ownerId: null,
        createdAt,
      });
      expect(project.id).toMatch(UUID);
      expect(project).toMatchObject({ rootUrl: 'https://x.test/', createdAt });
      expect(await repo.getById(project.id)).toEqual(project);
    });

    it('returns the existing project for the same root URL', async () => {
      const { projects: repo } = await factory();
      const first = await repo.findOrCreateByRootUrl({
        rootUrl: 'https://x.test/',
        ownerId: null,
        createdAt,
      });
      const second = await repo.findOrCreateByRootUrl({
        rootUrl: 'https://x.test/',
        ownerId: null,
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      expect(second).toEqual(first);
      expect(await repo.list(null)).toHaveLength(1);
    });

    it('keeps http, https and www variants as distinct projects', async () => {
      const { projects: repo } = await factory();
      const urls = ['https://x.test/', 'http://x.test/', 'https://www.x.test/'];
      for (const rootUrl of urls)
        await repo.findOrCreateByRootUrl({ rootUrl, ownerId: null, createdAt });
      expect((await repo.list(null)).map((project) => project.rootUrl).sort()).toEqual(
        [...urls].sort(),
      );
    });

    describe('with owners', () => {
      const rootUrl = 'https://x.test/';

      const setup = async () => {
        const { projects, accounts } = await factory();
        const u = await accounts.insertUser('u@example.fr');
        const v = await accounts.insertUser('v@example.fr');
        return { projects, u, v };
      };

      it('creates one project per owner for the same root URL, and one without owner', async () => {
        const { projects, u, v } = await setup();
        const created = [
          await projects.findOrCreateByRootUrl({ rootUrl, ownerId: null, createdAt }),
          await projects.findOrCreateByRootUrl({ rootUrl, ownerId: u, createdAt }),
          await projects.findOrCreateByRootUrl({ rootUrl, ownerId: v, createdAt }),
        ];

        expect(new Set(created.map(({ id }) => id)).size).toBe(3);
        expect(created.map(({ ownerId }) => ownerId)).toEqual([null, u, v]);
      });

      it('returns the same project for the same owner and root URL', async () => {
        const { projects, u } = await setup();
        const first = await projects.findOrCreateByRootUrl({ rootUrl, ownerId: u, createdAt });
        const second = await projects.findOrCreateByRootUrl({ rootUrl, ownerId: u, createdAt });
        expect(second.id).toBe(first.id);
      });

      it('returns the same project for two concurrent calls without owner', async () => {
        const { projects } = await setup();
        const [first, second] = await Promise.all([
          projects.findOrCreateByRootUrl({ rootUrl, ownerId: null, createdAt }),
          projects.findOrCreateByRootUrl({ rootUrl, ownerId: null, createdAt }),
        ]);
        expect(second.id).toBe(first.id);
        expect(await projects.list(null)).toHaveLength(1);
      });

      it('lists only the showcase projects for an anonymous reader', async () => {
        const { projects, u, v } = await setup();
        const showcase = await projects.findOrCreateByRootUrl({
          rootUrl: 'https://showcase.test/',
          ownerId: null,
          createdAt,
        });
        await projects.findOrCreateByRootUrl({ rootUrl: 'https://u.test/', ownerId: u, createdAt });
        await projects.findOrCreateByRootUrl({ rootUrl: 'https://v.test/', ownerId: v, createdAt });

        expect((await projects.list(null)).map(({ id }) => id)).toEqual([showcase.id]);
      });

      it('lists the projects of the reader and the showcase, never those of another account', async () => {
        const { projects, u, v } = await setup();
        await projects.findOrCreateByRootUrl({
          rootUrl: 'https://showcase.test/',
          ownerId: null,
          createdAt,
        });
        await projects.findOrCreateByRootUrl({ rootUrl: 'https://u.test/', ownerId: u, createdAt });
        await projects.findOrCreateByRootUrl({ rootUrl: 'https://v.test/', ownerId: v, createdAt });

        const urls = (await projects.list(u)).map((project) => project.rootUrl).sort();

        expect(urls).toEqual(['https://showcase.test/', 'https://u.test/']);
      });
    });

    it('returns null for an unknown project id', async () => {
      const { projects: repo } = await factory();
      expect(await repo.getById('missing')).toBeNull();
    });
  });
};
