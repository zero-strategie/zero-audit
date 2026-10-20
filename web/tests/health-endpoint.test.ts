import type { APIContext } from 'astro';
import { describe, expect, it } from 'vitest';
import { GET } from '../src/pages/health';
import { fakeApiClient } from './fake-api-client';

const callHealth = (healthy: boolean): Promise<Response> =>
  Promise.resolve(
    GET({
      locals: { apiClient: fakeApiClient({ checkHealth: () => Promise.resolve(healthy) }) },
    } as unknown as APIContext),
  );

describe('GET /health', () => {
  it('answers 200 with a short JSON body when the API is healthy', async () => {
    const response = await callHealth(true);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('answers 503 without any API detail when the API is not healthy', async () => {
    const response = await callHealth(false);

    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"status":"unavailable"}');
  });
});
