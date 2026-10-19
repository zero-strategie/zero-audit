import { expect, it } from 'vitest';
import { onRequest } from '../src/middleware';

it('provides the HTTP API client to every request', async () => {
  const context = { locals: {} } as Parameters<typeof onRequest>[0];

  await onRequest(context, () => Promise.resolve(new Response('ok')));

  expect(typeof context.locals.apiClient.listProjects).toBe('function');
});
