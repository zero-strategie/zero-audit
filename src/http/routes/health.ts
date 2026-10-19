import type { FastifyInstance } from 'fastify';
import type { CheckHealth } from '../../application/check-health.js';

const HTTP_OK = 200;
const HTTP_SERVICE_UNAVAILABLE = 503;

const healthBodySchema = {
  type: 'object',
  required: ['status'],
  properties: { status: { type: 'string' } },
} as const;

const healthSchema = {
  response: { 200: healthBodySchema, 503: healthBodySchema },
} as const;

export const registerHealthRoutes = (
  app: FastifyInstance,
  deps: { checkHealth: CheckHealth },
): void => {
  app.get('/health', { schema: healthSchema }, async (_request, reply) => {
    const status = await deps.checkHealth.execute();
    return reply.code(status === 'ok' ? HTTP_OK : HTTP_SERVICE_UNAVAILABLE).send({ status });
  });
};
