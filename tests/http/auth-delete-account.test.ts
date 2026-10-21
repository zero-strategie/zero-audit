import { describe, expect, it } from 'vitest';
import { NOW } from '../support/auth-doubles.js';
import { buildAuthServer, PASSWORD, seedAccount } from './auth-support.js';

const credentials = { email: 'alice@exemple.test', password: PASSWORD };

const seedAudit = async (
  server: ReturnType<typeof buildAuthServer>,
  ownerId: string | null,
  rootUrl: string,
) => {
  const project = await server.projects.findOrCreateByRootUrl({ rootUrl, ownerId, createdAt: NOW });
  const snapshot = await server.snapshots.create({
    projectId: project.id,
    launchedBy: ownerId,
    pagesLimit: 10,
    startedAt: NOW,
  });
  return { project, snapshot };
};

const setup = async () => {
  const server = buildAuthServer();
  const alice = await seedAccount(server.kit, { verified: true });
  const bob = await seedAccount(server.kit, { verified: true, email: 'bob@exemple.test' });
  const { sessionId } = (await server.post('/auth/login', credentials)).json<{
    sessionId: string;
  }>();
  const showcase = await seedAudit(server, null, 'https://vitrine.example.test/');
  const others = await seedAudit(server, bob.id, 'https://bob.example.test/');
  const mine = await seedAudit(server, alice.id, 'https://alice.example.test/');
  return { ...server, alice, bob, sessionId, showcase, others, mine };
};

describe('DELETE /auth/me', () => {
  it('answers 401 without a session and 401 with a wrong password, erasing nothing', async () => {
    const { del, kit, alice, sessionId } = await setup();

    const anonymous = await del('/auth/me', { password: PASSWORD });
    const wrong = await del(
      '/auth/me',
      { password: 'wrong password!' },
      { 'x-session-id': sessionId },
    );

    expect(anonymous.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(await kit.users.findById(alice.id)).not.toBeNull();
  });

  it('answers 204 and erases the account while the showcase and other accounts stay intact', async () => {
    const { del, get, kit, alice, bob, sessionId, snapshots, projects, mine, others, showcase } =
      await setup();
    await snapshots.finish(mine.snapshot.id, { finishedAt: NOW, pagesCrawled: 0 });

    const response = await del('/auth/me', { password: PASSWORD }, { 'x-session-id': sessionId });

    expect(response.statusCode).toBe(204);
    expect(await kit.users.findById(alice.id)).toBeNull();
    expect((await get('/auth/me', { 'x-session-id': sessionId })).statusCode).toBe(401);
    expect(await projects.getById(mine.project.id)).toBeNull();
    expect(await snapshots.getById(mine.snapshot.id)).toBeNull();
    expect(await kit.users.findById(bob.id)).not.toBeNull();
    expect(await projects.getById(others.project.id)).not.toBeNull();
    expect(await snapshots.getById(showcase.snapshot.id)).not.toBeNull();
  });

  it('answers 409 while an audit of the account is running and erases nothing', async () => {
    const { del, kit, alice, sessionId } = await setup();

    const response = await del('/auth/me', { password: PASSWORD }, { 'x-session-id': sessionId });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: { code: 'conflict', message: 'Un audit est en cours, réessayez à la fin' },
    });
    expect(await kit.users.findById(alice.id)).not.toBeNull();
  });
});
