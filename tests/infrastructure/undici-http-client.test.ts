import { afterEach, describe, expect, it } from 'vitest';
import { isNetworkFailure, type HttpResponse } from '../../src/application/ports/http-client.js';
import { SystemClock } from '../../src/infrastructure/system-clock.js';
import {
  UndiciHttpClient,
  type UndiciHttpClientOptions,
} from '../../src/infrastructure/undici-http-client.js';
import { buildUserAgent } from '../../src/infrastructure/user-agent.js';
import { startFixtureServer, type FixtureServer } from '../support/fixture-server.js';
import pkg from '../../package.json' with { type: 'json' };

let server: FixtureServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

const clientWith = (
  overrides: Partial<Omit<UndiciHttpClientOptions, 'clock' | 'userAgent'>> = {},
) => new UndiciHttpClient({ clock: new SystemClock(), userAgent: buildUserAgent(), ...overrides });

const expectResponse = (result: Awaited<ReturnType<UndiciHttpClient['get']>>): HttpResponse => {
  if (isNetworkFailure(result)) throw new Error(`unexpected failure: ${result.message}`);
  return result;
};

describe('UndiciHttpClient', () => {
  it('reports the response time as a whole number of milliseconds', async () => {
    server = await startFixtureServer({ '/': { status: 200, body: 'ok' } });
    const readings = [10.25, 12.5];
    const clock = { now: () => readings.shift() ?? 0 };
    const client = new UndiciHttpClient({ clock, userAgent: buildUserAgent() });

    const response = expectResponse(await client.get(`${server.baseUrl}/`));

    expect(response.responseTimeMs).toBe(2);
  });

  it('sends the ZeroAuditBot user-agent built from the package version', async () => {
    server = await startFixtureServer({ '/': { status: 200, body: 'ok' } });

    await clientWith().get(`${server.baseUrl}/`);

    expect(server.requests[0]?.headers['user-agent']).toBe(
      `ZeroAuditBot/${pkg.version} (+https://zero-strategie.dev)`,
    );
  });

  it('returns a 301 with its location header without following it', async () => {
    server = await startFixtureServer({
      '/old': { status: 301, headers: { Location: '/new' } },
      '/new': { status: 200, body: 'new' },
    });

    const response = expectResponse(await clientWith().get(`${server.baseUrl}/old`));

    expect(response.status).toBe(301);
    expect(response.headers['location']).toBe('/new');
    expect(server.requests.map((request) => request.path)).toEqual(['/old']);
  });

  it('returns a timeout failure when the server answers too late', async () => {
    server = await startFixtureServer({ '/slow': { status: 200, delayMs: 300 } });

    const result = await clientWith({ timeoutMs: 100 }).get(`${server.baseUrl}/slow`);

    expect(isNetworkFailure(result) && result.kind).toBe('timeout');
  });

  it('returns a connection failure when the port is closed', async () => {
    server = await startFixtureServer({});
    const closedUrl = server.baseUrl;
    await server.close();
    server = undefined;

    const result = await clientWith().get(`${closedUrl}/`);

    expect(isNetworkFailure(result) && result.kind).toBe('connection');
  });

  it('stops reading at the body cap and flags the body as truncated', async () => {
    server = await startFixtureServer({ '/big': { status: 200, body: 'x'.repeat(1000) } });

    const response = expectResponse(
      await clientWith({ maxBodyBytes: 100 }).get(`${server.baseUrl}/big`),
    );

    expect(response.truncated).toBe(true);
    expect(response.body).toHaveLength(100);
  });

  it('does not flag a body under the cap as truncated', async () => {
    server = await startFixtureServer({ '/small': { status: 200, body: 'hello' } });

    const response = expectResponse(await clientWith().get(`${server.baseUrl}/small`));

    expect(response).toMatchObject({ body: 'hello', truncated: false, status: 200 });
  });

  describe('with blockPrivateAddresses', () => {
    const resolvingTo =
      (...addresses: string[]) =>
      () =>
        Promise.resolve(
          addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
        );

    it('fails with "blocked" and opens no connection when the host resolves to a loopback address', async () => {
      server = await startFixtureServer({ '/': { status: 200, body: 'secret' } });
      const port = new URL(server.baseUrl).port;
      const client = clientWith({
        blockPrivateAddresses: true,
        resolver: resolvingTo('127.0.0.1'),
      });

      const result = await client.get(`http://site.test:${port}/`);

      expect(result).toMatchObject({ kind: 'blocked' });
      expect(server.requests).toEqual([]);
    });
  });
});
