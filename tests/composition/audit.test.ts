import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuditEvents } from '../../src/application/ports/audit-events.js';
import { RootUnreachable } from '../../src/domain/errors.js';
import { createRunAudit } from '../../src/composition/audit.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { startFixtureServer, type FixtureServer } from '../support/fixture-server.js';

const silentEvents: AuditEvents = {
  started: () => undefined,
  finished: () => undefined,
  failed: () => undefined,
};

const PAGE = {
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body: '<html><head><title>Page de test pour le crawler</title></head><body><h1>Titre</h1></body></html>',
};

describe('createRunAudit', () => {
  let server: FixtureServer;

  beforeEach(async () => {
    server = await startFixtureServer({ '/': PAGE });
  });

  afterEach(async () => {
    await server.close();
  });

  const audit = async (blockPrivateAddresses: boolean) => {
    const storage = {
      projects: new InMemoryProjectRepository(),
      snapshots: new InMemorySnapshotRepository(),
    };
    const runAudit = createRunAudit({ storage, events: silentEvents, blockPrivateAddresses });
    return runAudit.execute({ rootUrl: `${server.baseUrl}/`, limit: 5, delayMs: 0 });
  };

  it('guards the HTTP client when private addresses are blocked', async () => {
    await expect(audit(true)).rejects.toThrow(RootUnreachable);
    await expect(audit(true)).rejects.toThrow('blocked');
  });

  it('crawls a loopback target when the guard is off', async () => {
    const { pages } = await audit(false);

    expect(pages.map(({ status }) => status)).toEqual([200]);
  });
});
