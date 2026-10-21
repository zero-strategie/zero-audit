import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ApiUnreachable,
  Conflict,
  Forbidden,
  InvalidRequest,
  NotFound,
  ServiceUnavailable,
  TooManyRequests,
  Unauthenticated,
} from '../src/lib/api/errors';
import { resolveApiBaseUrl } from '../src/lib/api/config';
import { fetchApiClient } from '../src/lib/api/fetch-api-client';

const BASE_URL = 'http://api.test:3000';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('resolveApiBaseUrl', () => {
  it('defaults to the local API when ZERO_AUDIT_API_URL is not set', () => {
    expect(resolveApiBaseUrl({})).toBe('http://127.0.0.1:3000');
  });

  it('uses ZERO_AUDIT_API_URL without trailing slash', () => {
    expect(resolveApiBaseUrl({ ZERO_AUDIT_API_URL: 'http://api.test:9/' })).toBe(
      'http://api.test:9',
    );
  });
});

describe('fetchApiClient audit launch', () => {
  const apiError = (message: string, status: number) =>
    json({ error: { code: 'x', message } }, status);

  it('startAudit posts the url and limit as JSON and returns the ids on 202', async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const fetchImpl: typeof fetch = (input, init) => {
      requests.push({ url: typeof input === 'string' ? input : '', init });
      return Promise.resolve(json({ snapshotId: 's9', projectId: 'p9' }, 202));
    };

    const started = await fetchApiClient(BASE_URL, fetchImpl).startAudit({
      url: 'https://e.com/',
      limit: 50,
    });

    expect(started).toEqual({ snapshotId: 's9', projectId: 'p9' });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(`${BASE_URL}/audits`);
    expect(requests[0]?.init?.method).toBe('POST');
    expect(new Headers(requests[0]?.init?.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(requests[0]?.init?.body as string)).toEqual({
      url: 'https://e.com/',
      limit: 50,
    });
  });

  it('startAudit translates a 400 into InvalidRequest with the API message', async () => {
    const client = fetchApiClient(BASE_URL, () =>
      Promise.resolve(apiError('Adresse refusée', 400)),
    );

    await expect(client.startAudit({ url: 'x', limit: 100 })).rejects.toEqual(
      new InvalidRequest('Adresse refusée'),
    );
  });

  it('startAudit translates a 409 into Conflict with the API message', async () => {
    const client = fetchApiClient(BASE_URL, () =>
      Promise.resolve(apiError('Un audit est déjà en cours', 409)),
    );

    const failure = await client
      .startAudit({ url: 'x', limit: 100 })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Conflict);
    expect((failure as Error).message).toBe('Un audit est déjà en cours');
  });

  it('startAudit reports an unexpected status as ApiUnreachable', async () => {
    const client = fetchApiClient(BASE_URL, () => Promise.resolve(json({}, 500)));

    await expect(client.startAudit({ url: 'x', limit: 100 })).rejects.toBeInstanceOf(
      ApiUnreachable,
    );
  });

  it('getAuditProgress reads /snapshots/:id/progress', async () => {
    const calls: string[] = [];
    const progress = {
      status: 'running',
      pagesCrawled: 3,
      pagesLimit: 100,
      startedAt: '2026-03-05T09:00:00.000Z',
      rootUrl: 'https://e.com/',
    };
    const fetchImpl: typeof fetch = (input) => {
      calls.push(typeof input === 'string' ? input : '');
      return Promise.resolve(json(progress));
    };

    const result = await fetchApiClient(BASE_URL, fetchImpl).getAuditProgress('a/b');

    expect(result).toEqual(progress);
    expect(calls).toEqual([`${BASE_URL}/snapshots/a%2Fb/progress`]);
  });

  it('getAuditProgress translates a 404 into NotFound', async () => {
    const client = fetchApiClient(BASE_URL, () => Promise.resolve(json({}, 404)));

    await expect(client.getAuditProgress('missing')).rejects.toBeInstanceOf(NotFound);
  });
});

describe('fetchApiClient', () => {
  it('calls <base>/snapshots/:id', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = (input) => {
      calls.push(typeof input === 'string' ? input : '');
      return Promise.resolve(json({ snapshot: { id: 'abc' } }));
    };

    await fetchApiClient(BASE_URL, fetchImpl).getSnapshotReport('abc');

    expect(calls).toEqual([`${BASE_URL}/snapshots/abc`]);
  });

  it('encodes the snapshot id in the path', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = (input) => {
      calls.push(typeof input === 'string' ? input : '');
      return Promise.resolve(json({}));
    };

    await fetchApiClient(BASE_URL, fetchImpl).getSnapshotReport('a/b');

    expect(calls).toEqual([`${BASE_URL}/snapshots/a%2Fb`]);
  });

  it('translates a 404 into NotFound', async () => {
    const client = fetchApiClient(BASE_URL, () =>
      Promise.resolve(json({ error: { code: 'not_found', message: 'x' } }, 404)),
    );

    await expect(client.getSnapshotReport('abc')).rejects.toBeInstanceOf(NotFound);
  });

  it('translates a 400 into InvalidRequest', async () => {
    const client = fetchApiClient(BASE_URL, () =>
      Promise.resolve(json({ error: { code: 'invalid_request', message: 'x' } }, 400)),
    );

    await expect(client.listProjects()).rejects.toBeInstanceOf(InvalidRequest);
  });

  it('translates a network failure into ApiUnreachable', async () => {
    const client = fetchApiClient(BASE_URL, () => Promise.reject(new TypeError('fetch failed')));

    await expect(client.listProjects()).rejects.toBeInstanceOf(ApiUnreachable);
  });

  it('translates a server error into ApiUnreachable', async () => {
    const client = fetchApiClient(BASE_URL, () => Promise.resolve(json({}, 500)));

    await expect(client.listProjects()).rejects.toBeInstanceOf(ApiUnreachable);
  });

  it('returns the parsed projects', async () => {
    const projects = [
      { id: 'p', rootUrl: 'https://a.test/', createdAt: 'x', latestSnapshot: null },
    ];
    const client = fetchApiClient(BASE_URL, () => Promise.resolve(json(projects)));

    expect(await client.listProjects()).toEqual(projects);
  });

  it('calls /snapshots/:id/issues with the severity filter', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = (input) => {
      calls.push(typeof input === 'string' ? input : '');
      return Promise.resolve(json([]));
    };
    const client = fetchApiClient(BASE_URL, fetchImpl);

    await client.listIssues('abc');
    await client.listIssues('abc', 'error');

    expect(calls).toEqual([
      `${BASE_URL}/snapshots/abc/issues`,
      `${BASE_URL}/snapshots/abc/issues?severity=error`,
    ]);
  });

  it('calls /snapshots/:id/issues/:checkId with the page number', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = (input) => {
      calls.push(typeof input === 'string' ? input : '');
      return Promise.resolve(json({ items: [], total: 0, page: 2, limit: 50 }));
    };

    await fetchApiClient(BASE_URL, fetchImpl).getOccurrences('abc', 15, 2);

    expect(calls).toEqual([`${BASE_URL}/snapshots/abc/issues/15?page=2`]);
  });

  it('keeps the API error message in InvalidRequest', async () => {
    const client = fetchApiClient(BASE_URL, () =>
      Promise.resolve(
        json({ error: { code: 'invalid_request', message: 'projets différents' } }, 400),
      ),
    );

    await expect(client.compare('a', 'b')).rejects.toThrow('projets différents');
  });

  it('calls /compare with a as base and b as target', async () => {
    const calls: string[] = [];
    const client = fetchApiClient(BASE_URL, (input) => {
      calls.push(typeof input === 'string' ? input : '');
      return Promise.resolve(json({}));
    });

    await client.compare('x', 'y z');

    expect(calls).toEqual([`${BASE_URL}/compare?a=x&b=y%20z`]);
  });

  it('calls the pages endpoint with page and sort', async () => {
    const calls: string[] = [];
    const client = fetchApiClient(BASE_URL, (input) => {
      calls.push(typeof input === 'string' ? input : '');
      return Promise.resolve(json({}));
    });

    await client.listPages('s1', 2, '-status');

    expect(calls).toEqual([`${BASE_URL}/snapshots/s1/pages?page=2&sort=-status`]);
  });

  it('calls the project snapshots endpoint', async () => {
    const calls: string[] = [];
    const client = fetchApiClient(BASE_URL, (input) => {
      calls.push(typeof input === 'string' ? input : '');
      return Promise.resolve(json([]));
    });

    await client.listProjectSnapshots('p1');

    expect(calls).toEqual([`${BASE_URL}/projects/p1/snapshots`]);
  });
});

describe('fetchApiClient.checkHealth', () => {
  it('calls <base>/health and is true when the API answers 200', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = (input) => {
      calls.push(typeof input === 'string' ? input : '');
      return Promise.resolve(json({ status: 'ok' }));
    };

    expect(await fetchApiClient(BASE_URL, fetchImpl).checkHealth()).toBe(true);
    expect(calls).toEqual([`${BASE_URL}/health`]);
  });

  it('is false when the API answers 503', async () => {
    const client = fetchApiClient(BASE_URL, () =>
      Promise.resolve(json({ status: 'unavailable' }, 503)),
    );

    expect(await client.checkHealth()).toBe(false);
  });

  it('is false when the API is unreachable', async () => {
    const client = fetchApiClient(BASE_URL, () => Promise.reject(new TypeError('fetch failed')));

    expect(await client.checkHealth()).toBe(false);
  });

  describe('against a silent API', () => {
    let silentApi: Server;

    afterEach(async () => {
      silentApi.closeAllConnections();
      await new Promise((resolve) => silentApi.close(resolve));
    });

    it('is false once the health timeout has elapsed', async () => {
      silentApi = createServer(() => undefined);
      await new Promise<void>((resolve) => silentApi.listen(0, '127.0.0.1', resolve));
      const { port } = silentApi.address() as AddressInfo;
      const client = fetchApiClient(`http://127.0.0.1:${String(port)}`, fetch, {
        healthTimeoutMs: 50,
      });

      expect(await client.checkHealth()).toBe(false);
    });
  });
});

describe('fetchApiClient accounts', () => {
  const apiError = (message: string, status: number) =>
    json({ error: { code: 'x', message } }, status);
  const recording = (answer: () => Response) => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const fetchImpl: typeof fetch = (input, init) => {
      requests.push({ url: typeof input === 'string' ? input : '', init });
      return Promise.resolve(answer());
    };
    return { requests, fetchImpl };
  };

  it('sends the session and the visitor address on every request when it has them', async () => {
    const { requests, fetchImpl } = recording(() => json([]));

    await fetchApiClient(BASE_URL, fetchImpl, {
      sessionId: 'sess-1',
      clientIp: '203.0.113.9',
    }).listProjects();

    expect(requests[0]?.init?.headers).toMatchObject({
      'x-session-id': 'sess-1',
      'x-real-ip': '203.0.113.9',
    });
  });

  it('sends neither header for an anonymous request', async () => {
    const { requests, fetchImpl } = recording(() => json([]));

    await fetchApiClient(BASE_URL, fetchImpl).listProjects();

    expect(requests[0]?.init?.headers).toEqual({});
  });

  it('register posts the form fields and returns the generic message', async () => {
    const { requests, fetchImpl } = recording(() => json({ message: 'ok' }, 202));

    const message = await fetchApiClient(BASE_URL, fetchImpl).register({
      email: 'a@example.test',
      password: 'a long enough password',
      website: '',
    });

    expect(message).toBe('ok');
    expect(requests[0]?.url).toBe(`${BASE_URL}/auth/register`);
    expect(requests[0]?.init?.method).toBe('POST');
    expect(JSON.parse(requests[0]?.init?.body as string)).toEqual({
      email: 'a@example.test',
      password: 'a long enough password',
      website: '',
    });
  });

  it('login returns the session id', async () => {
    const { fetchImpl } = recording(() => json({ sessionId: 'sess-2' }));

    expect(
      await fetchApiClient(BASE_URL, fetchImpl).login({ email: 'a@example.test', password: 'x' }),
    ).toBe('sess-2');
  });

  it('verifyEmail posts the token and returns the session id', async () => {
    const { requests, fetchImpl } = recording(() => json({ sessionId: 'sess-3' }));

    expect(await fetchApiClient(BASE_URL, fetchImpl).verifyEmail('tok')).toBe('sess-3');
    expect(requests[0]?.url).toBe(`${BASE_URL}/auth/verify-email`);
  });

  it('getCurrentAccount reads /auth/me', async () => {
    const account = {
      email: 'a@example.test',
      isAdmin: false,
      pagesLimitMax: 100,
      auditsRemaining: 2,
      nextAuditAt: null,
    };
    const { requests, fetchImpl } = recording(() => json(account));

    expect(await fetchApiClient(BASE_URL, fetchImpl).getCurrentAccount()).toEqual(account);
    expect(requests[0]?.url).toBe(`${BASE_URL}/auth/me`);
  });

  it.each([
    ['logout', 'POST', '/auth/logout', (c: ReturnType<typeof fetchApiClient>) => c.logout()],
    [
      'confirmPasswordReset',
      'POST',
      '/auth/password-reset/confirm',
      (c: ReturnType<typeof fetchApiClient>) =>
        c.confirmPasswordReset({ token: 't', password: 'p' }),
    ],
    [
      'deleteAccount',
      'DELETE',
      '/auth/me',
      (c: ReturnType<typeof fetchApiClient>) => c.deleteAccount('p'),
    ],
  ])('%s accepts an empty 204 answer', async (_, method, path, call) => {
    const { requests, fetchImpl } = recording(() => new Response(null, { status: 204 }));

    await call(fetchApiClient(BASE_URL, fetchImpl));

    expect(requests[0]?.init?.method).toBe(method);
    expect(requests[0]?.url).toBe(`${BASE_URL}${path}`);
  });

  it.each([
    ['requestPasswordReset', '/auth/password-reset/request'],
    ['resendVerification', '/auth/resend-verification'],
  ] as const)('%s posts the e-mail and returns the generic message', async (method, path) => {
    const { requests, fetchImpl } = recording(() => json({ message: 'sent' }, 202));

    expect(await fetchApiClient(BASE_URL, fetchImpl)[method]('a@example.test')).toBe('sent');
    expect(requests[0]?.url).toBe(`${BASE_URL}${path}`);
  });

  it.each([
    [401, Unauthenticated],
    [403, Forbidden],
    [429, TooManyRequests],
    [503, ServiceUnavailable],
    [400, InvalidRequest],
  ])('maps HTTP %i to its error carrying the API message', async (status, errorClass) => {
    const { fetchImpl } = recording(() => apiError('message en français', status));

    const failure = fetchApiClient(BASE_URL, fetchImpl).login({ email: 'e', password: 'p' });

    await expect(failure).rejects.toBeInstanceOf(errorClass);
    await expect(failure).rejects.toThrow('message en français');
  });
});
