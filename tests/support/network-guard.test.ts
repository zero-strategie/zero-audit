import { fetch, request } from 'undici';
import { describe, expect, it } from 'vitest';
import { startFixtureServer } from './fixture-server.js';

describe('global network guard', () => {
  it('rejects undici requests to a non-local host', async () => {
    await expect(request('http://example.com/')).rejects.toThrow();
  });

  it('rejects undici fetch calls to a non-local host', async () => {
    await expect(fetch('https://example.com/')).rejects.toThrow();
  });

  it('rejects the global fetch to a non-local host', async () => {
    await expect(globalThis.fetch('https://example.com/')).rejects.toThrow();
  });

  it('still allows requests to the local fixture server', async () => {
    const server = await startFixtureServer({ '/ok': { status: 200 } });
    try {
      expect((await request(`${server.baseUrl}/ok`)).statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });
});
