import { expect, it } from 'vitest';
import { createSessionMiddleware, onRequest } from '../src/middleware';
import { anAccount } from './fake-api-client';

type Context = Parameters<typeof onRequest>[0];

interface Sent {
  url: string;
  headers: Record<string, string>;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const run = async (options: {
  cookie?: string;
  realIp?: string;
  answer: () => Response | Error;
}) => {
  const sent: Sent[] = [];
  const deleted: string[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    sent.push({
      url: typeof input === 'string' ? input : '',
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const answer = options.answer();
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
  const headers = new Headers(options.realIp ? { 'x-real-ip': options.realIp } : {});
  const context = {
    locals: {},
    request: new Request('http://localhost/', { headers }),
    cookies: {
      get: (name: string) =>
        name === 'za_session' && options.cookie ? { value: options.cookie } : undefined,
      delete: (name: string) => {
        deleted.push(name);
      },
    },
  } as unknown as Context;

  await createSessionMiddleware('http://api.test', fetchImpl)(context, () =>
    Promise.resolve(new Response('ok')),
  );
  return { context, sent, deleted };
};

it('provides the HTTP API client to every request', async () => {
  const { context } = await run({ answer: () => json([]) });

  expect(typeof context.locals.apiClient.listProjects).toBe('function');
  expect(typeof onRequest).toBe('function');
});

it('does not call the API for the account without a session cookie', async () => {
  const { context, sent } = await run({ answer: () => json({}) });

  expect(sent).toEqual([]);
  expect(context.locals.user).toBeNull();
});

it('reads the account with the session and relays the visitor address', async () => {
  const { context, sent } = await run({
    cookie: 'sess-1',
    realIp: '203.0.113.9',
    answer: () => json(anAccount()),
  });

  expect(sent[0]?.url).toBe('http://api.test/auth/me');
  expect(sent[0]?.headers).toMatchObject({
    'x-session-id': 'sess-1',
    'x-real-ip': '203.0.113.9',
  });
  expect(context.locals.user).toEqual(anAccount());
});

it('forgets a session the API rejects and clears the cookie', async () => {
  const { context, deleted } = await run({
    cookie: 'stale',
    answer: () => json({ error: { code: 'unauthenticated', message: 'Connexion requise' } }, 401),
  });

  expect(context.locals.user).toBeNull();
  expect(deleted).toEqual(['za_session']);
});

it('stays anonymous but keeps the cookie when the API is unreachable', async () => {
  const { context, deleted } = await run({
    cookie: 'sess-1',
    answer: () => new TypeError('fetch failed'),
  });

  expect(context.locals.user).toBeNull();
  expect(deleted).toEqual([]);
});
