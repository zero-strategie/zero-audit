import type { FastifyInstance } from 'fastify';
import { DEFAULT_PAGES_LIMIT, PAGES_LIMIT_CHOICES } from '../../application/audit-limits.js';
import type { LaunchAudit } from '../../application/launch-audit.js';
import { errorResponseSchema } from '../errors.js';

const HTTP_ACCEPTED = 202;

const launchSchema = {
  body: {
    type: 'object',
    required: ['url'],
    properties: {
      url: { type: 'string', format: 'uri', pattern: '^https?://' },
      limit: { type: 'integer', enum: PAGES_LIMIT_CHOICES, default: DEFAULT_PAGES_LIMIT },
    },
  },
  response: {
    202: {
      type: 'object',
      required: ['snapshotId', 'projectId'],
      properties: { snapshotId: { type: 'string' }, projectId: { type: 'string' } },
    },
    400: errorResponseSchema,
    409: errorResponseSchema,
  },
} as const;

export const registerAuditRoutes = (
  app: FastifyInstance,
  useCases: { launchAudit: LaunchAudit },
): void => {
  app.post<{ Body: { url: string; limit: number } }>(
    '/audits',
    { schema: launchSchema },
    async (request, reply) => {
      const started = await useCases.launchAudit.execute(request.body);
      return reply.status(HTTP_ACCEPTED).send(started);
    },
  );
};
