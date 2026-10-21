import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectRepository } from '../../src/application/ports/project-repository.js';
import type { SessionRepository } from '../../src/application/ports/session-repository.js';
import type { SnapshotRepository } from '../../src/application/ports/snapshot-repository.js';
import type { UserRepository } from '../../src/application/ports/user-repository.js';
import { buildServer } from '../../src/http/server.js';
import { InMemoryAccountEraser } from '../../src/infrastructure/in-memory-account-eraser.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySessionRepository } from '../../src/infrastructure/in-memory-session-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { InMemoryUserRepository } from '../../src/infrastructure/in-memory-user-repository.js';
import { migrate } from '../../src/infrastructure/postgres/migrate.js';
import { PostgresSnapshotRepository } from '../../src/infrastructure/postgres/postgres-snapshot-repository.js';
import { FakeAuditRunner, FakeHostResolver } from '../support/audit-doubles.js';
import { buildAuthKit, NOW } from '../support/auth-doubles.js';
import { makePage } from '../support/check-fixtures.js';
import {
  createTestDatabase,
  TEST_DATABASE_URL,
  type TestDatabase,
} from '../support/postgres-test-database.js';

interface Storage {
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly projects: ProjectRepository;
  readonly snapshots: SnapshotRepository;
}

const ADMIN_EMAIL = 'admin@exemple.test';
const SESSION_FAR_FUTURE = new Date('2027-01-01T00:00:00.000Z');
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

type Persona = 'anonymous' | 'u' | 'v' | 'admin' | 'unknownSession' | 'expiredSession';
type Owner = 'showcase' | 'u' | 'v';

const PERSONAS: readonly Persona[] = [
  'anonymous',
  'u',
  'v',
  'admin',
  'unknownSession',
  'expiredSession',
];

/** Who may read the snapshots of each owner; an administrator is a plain account here. */
const CAN_READ: Record<Persona, readonly Owner[]> = {
  anonymous: ['showcase'],
  unknownSession: ['showcase'],
  expiredSession: ['showcase'],
  u: ['showcase', 'u'],
  v: ['showcase', 'v'],
  admin: ['showcase'],
};

const ROUTES = [
  { label: 'project snapshots', path: (id: string) => `/projects/${id}/snapshots`, key: 'project' },
  { label: 'report', path: (id: string) => `/snapshots/${id}`, key: 'snapshot' },
  { label: 'progress', path: (id: string) => `/snapshots/${id}/progress`, key: 'snapshot' },
  { label: 'issues', path: (id: string) => `/snapshots/${id}/issues`, key: 'snapshot' },
  { label: 'occurrences', path: (id: string) => `/snapshots/${id}/issues/15`, key: 'snapshot' },
  { label: 'pages', path: (id: string) => `/snapshots/${id}/pages`, key: 'snapshot' },
] as const;

interface Ids {
  readonly project: string;
  readonly snapshot: string;
}

const describeMatrix = (
  name: string,
  open: () => Promise<{ storage: Storage; close: () => Promise<void> }>,
) => {
  describe(`authorization matrix (${name})`, () => {
    let app: FastifyInstance;
    let close: () => Promise<void>;
    let runner: FakeAuditRunner;
    let ids: Record<Owner, Ids>;
    let sessionOf: Record<Persona, string | undefined>;

    const seedOwner = async (storage: Storage, owner: Owner, ownerId: string | null) => {
      const project = await storage.projects.findOrCreateByRootUrl({
        rootUrl: `https://${owner}.exemple.test/`,
        ownerId,
        createdAt: NOW,
      });
      const { id } = await storage.snapshots.create({
        launchedBy: ownerId,
        projectId: project.id,
        pagesLimit: 10,
        startedAt: NOW,
      });
      await storage.snapshots.addPages(id, [makePage(`https://${owner}.exemple.test/`)]);
      await storage.snapshots.addCheckResults(id, [
        {
          checkId: 15,
          severity: 'warning',
          theme: 'on-page',
          count: 1,
          examined: 1,
          occurrences: [{ checkId: 15, pageUrl: `https://${owner}.exemple.test/`, info: {} }],
        },
      ]);
      await storage.snapshots.finish(id, { finishedAt: NOW, pagesCrawled: 1 });
      return { project: project.id, snapshot: id };
    };

    const login = async (storage: Storage, email: string, sessionId: string, expiresAt: Date) => {
      const user = await storage.users.create({ email, passwordHash: 'h', createdAt: NOW });
      await storage.sessions.create({ id: sessionId, userId: user.id, createdAt: NOW, expiresAt });
      return user;
    };

    const request = (url: string, persona: Persona) => {
      const session = sessionOf[persona];
      return app.inject({
        method: 'GET',
        url,
        headers: session ? { 'x-session-id': session } : {},
      });
    };

    beforeAll(async () => {
      const opened = await open();
      close = opened.close;
      const { storage } = opened;
      const u = await login(storage, 'u@exemple.test', 'session-u', SESSION_FAR_FUTURE);
      const v = await login(storage, 'v@exemple.test', 'session-v', SESSION_FAR_FUTURE);
      await login(storage, ADMIN_EMAIL, 'session-admin', SESSION_FAR_FUTURE);
      await login(storage, 'old@exemple.test', 'session-old', NOW);
      sessionOf = {
        anonymous: undefined,
        u: 'session-u',
        v: 'session-v',
        admin: 'session-admin',
        unknownSession: 'session-nobody',
        expiredSession: 'session-old',
      };
      ids = {
        showcase: await seedOwner(storage, 'showcase', null),
        u: await seedOwner(storage, 'u', u.id),
        v: await seedOwner(storage, 'v', v.id),
      };
      runner = new FakeAuditRunner();
      const kit = buildAuthKit();
      app = buildServer({
        ...kit,
        ...storage,
        health: { ping: () => Promise.resolve() },
        eraser: new InMemoryAccountEraser({
          ...kit,
          projects: new InMemoryProjectRepository(),
          snapshots: new InMemorySnapshotRepository(),
        }),
        auditRunner: runner,
        hostResolver: new FakeHostResolver(),
        allowPrivateTargets: false,
        adminEmails: [ADMIN_EMAIL],
      });
    });

    beforeEach(() => {
      runner.progressOutcome = {
        status: 'running',
        pagesCrawled: 1,
        pagesLimit: 10,
        startedAt: NOW,
        rootUrl: 'https://live.exemple.test/',
      };
    });

    afterAll(async () => {
      await app.close();
      await close();
    });

    describe('GET /projects', () => {
      it.each([
        ['anonymous', ['showcase']],
        ['unknownSession', ['showcase']],
        ['expiredSession', ['showcase']],
        ['u', ['showcase', 'u']],
        ['v', ['showcase', 'v']],
      ] as const)('lists the showcase and the own projects for %s', async (persona, visible) => {
        const response = await request('/projects', persona);

        expect(response.statusCode).toBe(200);
        const body = response.json<{ id: string; owned: boolean }[]>();
        expect(body.map(({ id }) => id).sort()).toEqual(
          visible.map((owner) => ids[owner].project).sort(),
        );
        for (const { id, owned } of body) expect(owned).toBe(id !== ids.showcase.project);
        expect(JSON.stringify(body)).not.toContain('ownerId');
      });

      it('shows an administrator the showcase and nothing else but their own projects', async () => {
        const response = await request('/projects', 'admin');

        expect(response.json<{ id: string }[]>().map(({ id }) => id)).toEqual([
          ids.showcase.project,
        ]);
      });
    });

    describe.each(ROUTES)('$label route', ({ path, key }) => {
      it.each(
        PERSONAS.flatMap((persona) =>
          (['showcase', 'u', 'v'] as const).map((owner) => [persona, owner] as const),
        ),
      )('%s reading a %s resource', async (persona, owner) => {
        const response = await request(path(ids[owner][key]), persona);

        if (CAN_READ[persona].includes(owner)) {
          expect(response.statusCode).toBe(200);
          return;
        }
        const missing = await request(path(UNKNOWN_ID), persona);
        expect(response.statusCode).toBe(404);
        expect(response.body).toBe(missing.body.replaceAll(UNKNOWN_ID, ids[owner][key]));
      });
    });

    describe('GET /compare', () => {
      const compare = (a: Owner, b: Owner, persona: Persona) =>
        request(`/compare?a=${ids[a].snapshot}&b=${ids[b].snapshot}`, persona);

      it('is refused when one snapshot belongs to someone else', async () => {
        expect((await compare('u', 'v', 'u')).statusCode).toBe(404);
        expect((await compare('v', 'u', 'u')).statusCode).toBe(404);
        expect((await compare('showcase', 'v', 'u')).statusCode).toBe(404);
        expect((await compare('u', 'u', 'anonymous')).statusCode).toBe(404);
      });

      it('is allowed on snapshots the reader can see', async () => {
        expect((await compare('u', 'u', 'u')).statusCode).toBe(200);
        expect((await compare('showcase', 'showcase', 'anonymous')).statusCode).toBe(200);
        expect((await compare('showcase', 'showcase', 'v')).statusCode).toBe(200);
      });
    });

    it('does not read the in-memory progress of someone else audit', async () => {
      const response = await request(`/snapshots/${ids.v.snapshot}/progress`, 'u');

      expect(response.statusCode).toBe(404);
      expect(JSON.stringify(response.json())).not.toContain('live.exemple.test');
    });

    it('keeps the administrator out of the snapshot of another account', async () => {
      expect((await request(`/snapshots/${ids.v.snapshot}`, 'admin')).statusCode).toBe(404);
    });
  });
};

describeMatrix('in memory', () =>
  Promise.resolve({
    storage: {
      users: new InMemoryUserRepository(),
      sessions: new InMemorySessionRepository(),
      projects: new InMemoryProjectRepository(),
      snapshots: new InMemorySnapshotRepository(),
    },
    close: () => Promise.resolve(),
  }),
);

describe.skipIf(!TEST_DATABASE_URL)('authorization matrix on Postgres', () => {
  let database: TestDatabase | undefined;
  describeMatrix('postgres', async () => {
    database = await createTestDatabase(TEST_DATABASE_URL ?? '');
    await migrate(database.pool);
    const repository = new PostgresSnapshotRepository(database.pool);
    return {
      storage: {
        users: repository.users,
        sessions: repository.sessions,
        projects: repository.projects,
        snapshots: repository,
      },
      close: async () => {
        await database?.dispose();
      },
    };
  });
});
