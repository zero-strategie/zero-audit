import type { FastifyInstance } from 'fastify';
import { DEFAULT_PAGES_LIMIT, PAGES_LIMIT_CHOICES } from '../../application/audit-limits.js';
import type { LaunchAudit } from '../../application/launch-audit.js';
import { errorResponseSchema } from '../errors.js';
import { SESSION_HEADER, type ReaderOf } from '../reader.js';

const HTTP_ACCEPTED = 202;

const MAX_SESSION_ID_LENGTH = 256;

const launchSchema = {
  headers: {
    type: 'object',
    properties: { [SESSION_HEADER]: { type: 'string', maxLength: MAX_SESSION_ID_LENGTH } },
  },
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
    401: errorResponseSchema,
    409: errorResponseSchema,
    429: errorResponseSchema,
  },
} as const;

export const registerAuditRoutes = (
  app: FastifyInstance,
  useCases: { launchAudit: LaunchAudit },
  readerOf: ReaderOf,
): void => {
  app.post<{ Body: { url: string; limit: number } }>(
    '/audits',
    { schema: launchSchema },
    async (request, reply) => {
      const started = await useCases.launchAudit.execute(await readerOf(request), request.body);
      return reply.status(HTTP_ACCEPTED).send(started);
    },
  );
};
