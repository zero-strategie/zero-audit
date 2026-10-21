import { describe, expect, it } from 'vitest';
import type { StorageHealth } from '../../src/application/ports/storage-health.js';
import { idleAuditDependencies } from '../support/audit-doubles.js';
import { idleAccountDependencies } from '../support/auth-doubles.js';
import { buildServer } from '../../src/http/server.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';

const serverWith = (health: StorageHealth) =>
  buildServer({
    ...idleAccountDependencies(),
    projects: new InMemoryProjectRepository(),
    snapshots: new InMemorySnapshotRepository(),
    health,
    ...idleAuditDependencies(),
  });

describe('GET /health', () => {
  it('answers 200 {"status":"ok"} when the storage is reachable', async () => {
    const response = await serverWith({ ping: () => Promise.resolve() }).inject('/health');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('answers 503 {"status":"unavailable"} without leaking the failure', async () => {
    const secret = 'postgresql://user:hunter2@db.internal/zero_audit';
    const response = await serverWith({
      ping: () => Promise.reject(new Error(`connect ECONNREFUSED ${secret}`)),
    }).inject('/health');

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
    expect(response.body).not.toContain('hunter2');
    expect(response.body).not.toContain('ECONNREFUSED');
  });

  it('does not answer 200 to other methods', async () => {
    const response = await serverWith({ ping: () => Promise.resolve() }).inject({
      method: 'POST',
      url: '/health',
    });

    expect(response.statusCode).toBe(404);
  });
});
