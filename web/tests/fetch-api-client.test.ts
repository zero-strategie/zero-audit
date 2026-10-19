import { describe, expect, it } from 'vitest';
import { ApiUnreachable, InvalidRequest, NotFound } from '../src/lib/api/errors';
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
});
