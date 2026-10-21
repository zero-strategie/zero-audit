import { describe, expect, it } from 'vitest';
import type { AccountEraser } from '../../src/application/ports/account-eraser.js';
import type { EmailTokenRepository } from '../../src/application/ports/email-token-repository.js';
import type { ProjectRepository } from '../../src/application/ports/project-repository.js';
import type { SessionRepository } from '../../src/application/ports/session-repository.js';
import type { SnapshotRepository } from '../../src/application/ports/snapshot-repository.js';
import type { UserRepository } from '../../src/application/ports/user-repository.js';

const NOW = new Date('2026-03-10T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const FUTURE = new Date(NOW.getTime() + DAY_MS);

export interface AccountStorage {
  readonly users: UserRepository;
  readonly projects: ProjectRepository;
  readonly snapshots: SnapshotRepository;
  readonly sessions: SessionRepository;
  readonly emailTokens: EmailTokenRepository;
  readonly eraser: AccountEraser;
}

export interface SeededProject {
  readonly projectId: string;
  readonly snapshotId: string;
}

/** One project with a snapshot holding one row in every child table. */
export const seedProject = async (
  { projects, snapshots }: AccountStorage,
  input: { ownerId: string | null; rootUrl: string },
): Promise<SeededProject> => {
  const { id: projectId } = await projects.findOrCreateByRootUrl({ ...input, createdAt: NOW });
  const { id: snapshotId } = await snapshots.create({
    projectId,
    launchedBy: input.ownerId,
    pagesLimit: 10,
    startedAt: NOW,
  });
  await snapshots.addPages(snapshotId, [
    {
      url: input.rootUrl,
      depth: 0,
      status: 200,
      error: null,
      redirectTarget: null,
      redirectChain: [],
      headers: {},
      responseTimeMs: 5,
      contentType: 'text/html',
      isHtml: true,
      title: 'Home',
      metaDescription: null,
      canonical: null,
      h1: ['Home'],
      wordCount: 10,
      textRatio: 0.1,
      contentHash: 'hash',
      blockedByRobots: false,
    },
  ]);
  await snapshots.addLinks(snapshotId, [
    {
      sourceUrl: input.rootUrl,
      targetUrl: 'https://out.test/',
      type: 'external',
      rel: null,
      anchor: null,
    },
  ]);
  await snapshots.addSiteFiles(snapshotId, [
    { kind: 'robots', url: `${input.rootUrl}robots.txt`, status: 200, error: null },
  ]);
  await snapshots.addHostProbe(snapshotId, {
    url: input.rootUrl,
    status: 200,
    error: null,
    isHtml: true,
    canonical: null,
  });
  await snapshots.addSlashProbes(snapshotId, [
    {
      url: `${input.rootUrl}a/`,
      sourcePageUrl: `${input.rootUrl}a`,
      status: 200,
      error: null,
      isHtml: true,
      canonical: null,
    },
  ]);
  await snapshots.addCheckResults(snapshotId, [
    {
      checkId: 3,
      severity: 'error',
      theme: 'on-page',
      count: 1,
      examined: 1,
      occurrences: [{ checkId: 3, pageUrl: input.rootUrl, info: { length: 1 } }],
    },
  ]);
  await snapshots.finish(snapshotId, { finishedAt: NOW, pagesCrawled: 1 });
  return { projectId, snapshotId };
};

export const seedAccount = async (
  storage: AccountStorage,
  input: { email: string; createdAt?: Date; verified?: boolean },
): Promise<{ userId: string; seeded: SeededProject }> => {
  const { users, sessions, emailTokens } = storage;
  const user = await users.create({
    email: input.email,
    passwordHash: 'h',
    createdAt: input.createdAt ?? NOW,
  });
  if (input.verified) await users.markVerified(user.id, NOW);
  await sessions.create({
    id: `session-${input.email}`,
    userId: user.id,
    createdAt: NOW,
    expiresAt: FUTURE,
  });
  await emailTokens.create({
    token: `token-${input.email}`,
    userId: user.id,
    email: input.email,
    kind: 'verify',
    createdAt: NOW,
    expiresAt: FUTURE,
  });
  const seeded = await seedProject(storage, {
    ownerId: user.id,
    rootUrl: `https://${input.email}.test/`,
  });
  return { userId: user.id, seeded };
};

export const describeAccountEraserContract = (
  factory: () => Promise<AccountStorage> | AccountStorage,
): void => {
  describe('AccountEraser contract', () => {
    const isGone = async (
      storage: AccountStorage,
      email: string,
      userId: string,
      seeded: SeededProject,
    ) => ({
      user: await storage.users.findById(userId),
      project: await storage.projects.getById(seeded.projectId),
      snapshot: await storage.snapshots.getById(seeded.snapshotId),
      session: await storage.sessions.findValid(`session-${email}`, NOW),
      token: await storage.emailTokens.consume(`token-${email}`, 'verify', NOW),
    });

    it('erases the account and all it owns, leaving other accounts and the showcase intact', async () => {
      const storage = await factory();
      const u = await seedAccount(storage, { email: 'u@example.fr' });
      const v = await seedAccount(storage, { email: 'v@example.fr' });
      const showcase = await seedProject(storage, {
        ownerId: null,
        rootUrl: 'https://showcase.test/',
      });
      const showcaseBefore = await storage.snapshots.getById(showcase.snapshotId);
      const vBefore = await storage.snapshots.getById(v.seeded.snapshotId);

      await storage.eraser.eraseAccount(u.userId);

      expect(await isGone(storage, 'u@example.fr', u.userId, u.seeded)).toEqual({
        user: null,
        project: null,
        snapshot: null,
        session: null,
        token: null,
      });
      expect(await storage.users.findById(v.userId)).not.toBeNull();
      expect(await storage.snapshots.getById(v.seeded.snapshotId)).toEqual(vBefore);
      expect(await storage.snapshots.getById(showcase.snapshotId)).toEqual(showcaseBefore);
      expect(await storage.sessions.findValid('session-v@example.fr', NOW)).not.toBeNull();
      expect(await storage.projects.list(null)).toHaveLength(1);
    });

    it('purges only the accounts left unverified for more than 7 days', async () => {
      const storage = await factory();
      const old = await seedAccount(storage, {
        email: 'old@example.fr',
        createdAt: new Date(NOW.getTime() - 8 * DAY_MS),
      });
      const recent = await seedAccount(storage, {
        email: 'recent@example.fr',
        createdAt: new Date(NOW.getTime() - 6 * DAY_MS),
      });
      const verified = await seedAccount(storage, {
        email: 'verified@example.fr',
        createdAt: new Date(NOW.getTime() - 90 * DAY_MS),
        verified: true,
      });

      const purged = await storage.eraser.purgeUnverifiedBefore(
        new Date(NOW.getTime() - 7 * DAY_MS),
      );

      expect(purged).toBe(1);
      expect((await isGone(storage, 'old@example.fr', old.userId, old.seeded)).snapshot).toBeNull();
      expect((await isGone(storage, 'old@example.fr', old.userId, old.seeded)).user).toBeNull();
      expect((await storage.users.findById(recent.userId))?.email).toBe('recent@example.fr');
      expect(await storage.snapshots.getById(recent.seeded.snapshotId)).not.toBeNull();
      expect((await storage.users.findById(verified.userId))?.email).toBe('verified@example.fr');
      expect(await storage.snapshots.getById(verified.seeded.snapshotId)).not.toBeNull();
    });
  });
};
