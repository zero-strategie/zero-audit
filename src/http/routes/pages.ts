import type { FastifyInstance } from 'fastify';
import { PAGE_SORTS, type ListPages, type PageSort } from '../../application/list-pages.js';
import { PAGE_GROUPS } from '../../domain/page-groups.js';
import { errorResponseSchema } from '../errors.js';
import {
  pageEnvelope,
  paginationProperties,
  snapshotIdParams,
  type PaginationQuery,
} from '../schemas.js';

const DEFAULT_SORT: PageSort = 'url';

const pageListSchema = {
  params: snapshotIdParams,
  querystring: {
    type: 'object',
    properties: {
      ...paginationProperties,
      sort: { type: 'string', enum: PAGE_SORTS, default: DEFAULT_SORT },
    },
  },
  response: {
    200: pageEnvelope({
      type: 'object',
      required: ['url', 'status', 'depth', 'group', 'canonical', 'issues', 'responseTimeMs'],
      properties: {
        url: { type: 'string' },
        status: { type: ['integer', 'null'] },
        depth: { type: 'integer' },
        group: { type: 'string', enum: PAGE_GROUPS },
        canonical: { type: ['string', 'null'] },
        issues: { type: 'integer' },
        responseTimeMs: { type: 'number' },
      },
    }),
    404: errorResponseSchema,
  },
} as const;

export const registerPageRoutes = (
  app: FastifyInstance,
  useCases: { listPages: ListPages },
): void => {
  app.get<{ Params: { id: string }; Querystring: PaginationQuery & { sort: PageSort } }>(
    '/snapshots/:id/pages',
    { schema: pageListSchema },
    (request) => useCases.listPages.execute(request.params.id, request.query),
  );
};
