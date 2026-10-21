import { describe, expect, it } from 'vitest';
import { DeleteAccount } from '../../../src/application/auth/delete-account.js';
import { ResolveSession } from '../../../src/application/auth/resolve-session.js';
import { LOGIN_FAILURES_PER_ACCOUNT } from '../../../src/domain/abuse-limits.js';
import { AuditInProgress, TooManyAttempts, Unauthenticated } from '../../../src/domain/errors.js';
import { ORPHAN_AUDIT_MAX_AGE_MS } from '../../../src/domain/snapshot.js';
import { InMemoryAccountEraser } from '../../../src/infrastructure/in-memory-account-eraser.js';
import { InMemoryProjectRepository } from '../../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../../src/infrastructure/in-memory-snapshot-repository.js';
import { buildAuthKit, NOW } from '../../support/auth-doubles.js';

const PASSWORD = 'correct horse battery';

const setup = async () => {
  const kit = buildAuthKit();
  const projects = new InMemoryProjectRepository();
  const snapshots = new InMemorySnapshotRepository();
  const eraser = new InMemoryAccountEraser({ ...kit, projects, snapshots });
  const user = await kit.users.create({
    email: 'alice@exemple.test',
    passwordHash: `hashed:${PASSWORD}`,
    createdAt: NOW,
  });
  await kit.users.markVerified(user.id, NOW);
  await kit.sessions.create({
    id: 'session-1',
    userId: user.id,
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 1e9),
  });
  const project = await projects.findOrCreateByRootUrl({
    rootUrl: 'https://alice.example.test/',
    ownerId: user.id,
    createdAt: NOW,
  });
  const snapshot = await snapshots.create({
    projectId: project.id,
    launchedBy: user.id,
    pagesLimit: 10,
    startedAt: NOW,
  });
  const deleteAccount = new DeleteAccount({
    ...kit,
    projects,
    snapshots,
    eraser,
    resolveSession: new ResolveSession(kit),
  });
  return { kit, user, projects, snapshots, snapshot, project, deleteAccount };
};

describe('DeleteAccount', () => {
  it('refuses a wrong password and erases nothing', async () => {
    const { kit, user, snapshot, snapshots, deleteAccount } = await setup();
    await snapshots.finish(snapshot.id, { finishedAt: NOW, pagesCrawled: 0 });

    await expect(
      deleteAccount.execute({ sessionId: 'session-1', password: 'wrong password!' }),
    ).rejects.toThrow(Unauthenticated);

    expect(await kit.users.findById(user.id)).not.toBeNull();
    expect(await snapshots.getById(snapshot.id)).not.toBeNull();
  });

  it('refuses a missing or unknown session', async () => {
    const { deleteAccount } = await setup();

    await expect(
      deleteAccount.execute({ sessionId: undefined, password: PASSWORD }),
    ).rejects.toThrow(Unauthenticated);
    await expect(
      deleteAccount.execute({ sessionId: 'unknown', password: PASSWORD }),
    ).rejects.toThrow(Unauthenticated);
  });

  it('erases the account with its sessions, projects and snapshots once the password is right', async () => {
    const { kit, user, snapshot, snapshots, projects, project, deleteAccount } = await setup();
    await snapshots.finish(snapshot.id, { finishedAt: NOW, pagesCrawled: 0 });

    await deleteAccount.execute({ sessionId: 'session-1', password: PASSWORD });

    expect(await kit.users.findById(user.id)).toBeNull();
    expect(await kit.sessions.findValid('session-1', NOW)).toBeNull();
    expect(await projects.getById(project.id)).toBeNull();
    expect(await snapshots.getById(snapshot.id)).toBeNull();
  });

  it('refuses while an audit of the account is running, then accepts once it ended', async () => {
    const { kit, user, snapshot, snapshots, deleteAccount } = await setup();

    await expect(
      deleteAccount.execute({ sessionId: 'session-1', password: PASSWORD }),
    ).rejects.toThrow(AuditInProgress);
    expect(await kit.users.findById(user.id)).not.toBeNull();

    await snapshots.fail(snapshot.id, NOW);
    await deleteAccount.execute({ sessionId: 'session-1', password: PASSWORD });

    expect(await kit.users.findById(user.id)).toBeNull();
  });

  it('ignores a running snapshot left by a killed process', async () => {
    const { kit, user, deleteAccount } = await setup();
    kit.clock.advance(ORPHAN_AUDIT_MAX_AGE_MS + 1);
    await kit.sessions.create({
      id: 'session-2',
      userId: user.id,
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 1e10),
    });

    await deleteAccount.execute({ sessionId: 'session-2', password: PASSWORD });

    expect(await kit.users.findById(user.id)).toBeNull();
  });

  it('blocks further attempts after too many wrong passwords, even with the right one', async () => {
    const { kit, user, snapshot, snapshots, deleteAccount } = await setup();
    await snapshots.finish(snapshot.id, { finishedAt: NOW, pagesCrawled: 0 });
    for (let attempt = 0; attempt < LOGIN_FAILURES_PER_ACCOUNT; attempt += 1) {
      await expect(
        deleteAccount.execute({ sessionId: 'session-1', password: 'wrong password!' }),
      ).rejects.toThrow(Unauthenticated);
    }

    await expect(
      deleteAccount.execute({ sessionId: 'session-1', password: PASSWORD }),
    ).rejects.toThrow(TooManyAttempts);

    expect(await kit.users.findById(user.id)).not.toBeNull();
  });
});
