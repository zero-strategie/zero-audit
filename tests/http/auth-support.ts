import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/http/server.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { idleAuditDependencies } from '../support/audit-doubles.js';
import { buildAuthKit, NOW } from '../support/auth-doubles.js';

export const PASSWORD = 'correct horse battery';
export const GENERIC_REGISTER_MESSAGE =
  'Si cette adresse peut être utilisée, un e-mail vient de vous être envoyé';

export const buildAuthServer = (adminEmails: string[] = []) => {
  const kit = buildAuthKit();
  const snapshots = new InMemorySnapshotRepository();
  const app: FastifyInstance = buildServer({
    projects: new InMemoryProjectRepository(),
    snapshots,
    health: snapshots,
    ...idleAuditDependencies(),
    ...kit,
    adminEmails,
  });
  const post = (url: string, payload: object = {}, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url, payload, headers });
  const get = (url: string, headers: Record<string, string> = {}) =>
    app.inject({ method: 'GET', url, headers });
  return { app, kit, post, get };
};

export const seedAccount = async (
  kit: ReturnType<typeof buildAuthKit>,
  { verified, email = 'alice@exemple.test' }: { verified: boolean; email?: string },
) => {
  const user = await kit.users.create({
    email,
    passwordHash: `hashed:${PASSWORD}`,
    createdAt: NOW,
  });
  if (verified) await kit.users.markVerified(user.id, NOW);
  return user;
};
