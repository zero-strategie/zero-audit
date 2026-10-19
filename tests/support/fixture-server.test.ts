import { request } from 'undici';
import { afterEach, describe, expect, it } from 'vitest';
import { startFixtureServer, type FixtureServer } from './fixture-server.js';

describe('fixture server', () => {
  const started: FixtureServer[] = [];
  const start = async (...args: Parameters<typeof startFixtureServer>) => {
    const server = await startFixtureServer(...args);
    started.push(server);
    return server;
  };

  afterEach(async () => {
    await Promise.all(started.splice(0).map((server) => server.close()));
  });

  it('serves the declared status, headers and body on a loopback address', async () => {
    const server = await start({
      '/page': { status: 200, headers: { 'content-type': 'text/html' }, body: '<p>hi</p>' },
      '/old': { status: 301, headers: { location: '/page' } },
      '/missing': { status: 404 },
      '/broken': { status: 500 },
    });

    expect(server.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const page = await request(`${server.baseUrl}/page`);
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toBe('text/html');
    expect(await page.body.text()).toBe('<p>hi</p>');
    const old = await request(`${server.baseUrl}/old`);
    expect(old.statusCode).toBe(301);
    expect(old.headers['location']).toBe('/page');
    await old.body.dump();
    expect((await request(`${server.baseUrl}/missing`)).statusCode).toBe(404);
    expect((await request(`${server.baseUrl}/broken`)).statusCode).toBe(500);
  });

  it('answers 404 for undeclared paths and records every received request', async () => {
    const server = await start({});

    const response = await request(`${server.baseUrl}/nope?q=1`, {
      headers: { 'user-agent': 'TestBot/1.0' },
    });

    expect(response.statusCode).toBe(404);
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]).toMatchObject({
      method: 'GET',
      path: '/nope?q=1',
      headers: { 'user-agent': 'TestBot/1.0' },
    });
  });

  it('delays the response when delayMs is declared', async () => {
    const server = await start({ '/slow': { status: 200, delayMs: 100 } });

    const startedAt = Date.now();
    await (await request(`${server.baseUrl}/slow`)).body.dump();

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(90);
  });

  it('lets two servers run in parallel on distinct ports', async () => {
    const [first, second] = await Promise.all([
      start({ '/a': { status: 200, body: 'first' } }),
      start({ '/a': { status: 200, body: 'second' } }),
    ]);

    expect(first.baseUrl).not.toBe(second.baseUrl);
    expect(await (await request(`${first.baseUrl}/a`)).body.text()).toBe('first');
    expect(await (await request(`${second.baseUrl}/a`)).body.text()).toBe('second');
  });

  it('stops accepting connections once closed', async () => {
    const server = await startFixtureServer({ '/a': { status: 200 } });
    await server.close();

    await expect(request(`${server.baseUrl}/a`)).rejects.toThrow();
  });
});
