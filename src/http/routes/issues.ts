import type { FastifyInstance } from 'fastify';
import type { ListIssues } from '../../application/list-issues.js';
import type { ListOccurrences } from '../../application/list-occurrences.js';
import type { Severity } from '../../domain/check.js';
import { errorResponseSchema } from '../errors.js';
import {
  pageEnvelope,
  paginationProperties,
  snapshotIdParams,
  type PaginationQuery,
} from '../schemas.js';

const issueListSchema = {
  params: snapshotIdParams,
  querystring: {
    type: 'object',
    properties: { severity: { type: 'string', enum: ['error', 'warning', 'notice'] } },
  },
  response: {
    200: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'checkId',
          'label',
          'severity',
          'theme',
          'count',
          'examined',
          'delta',
          'newCount',
          'fixedCount',
        ],
        properties: {
          checkId: { type: 'integer' },
          label: { type: 'string' },
          severity: { type: 'string' },
          theme: { type: 'string' },
          count: { type: 'integer' },
          examined: { type: 'integer' },
          delta: { type: 'integer' },
          newCount: { type: 'integer' },
          fixedCount: { type: 'integer' },
        },
      },
    },
    404: errorResponseSchema,
  },
} as const;

const occurrenceListSchema = {
  params: {
    type: 'object',
    required: ['id', 'checkId'],
    properties: {
      id: { type: 'string', minLength: 1 },
      checkId: { type: 'integer' },
    },
  },
  querystring: { type: 'object', properties: paginationProperties },
  response: {
    200: pageEnvelope({
      type: 'object',
      required: ['pageUrl', 'info'],
      properties: {
        pageUrl: { type: ['string', 'null'] },
        info: { type: 'object', additionalProperties: true },
      },
    }),
    404: errorResponseSchema,
  },
} as const;

export const registerIssueRoutes = (
  app: FastifyInstance,
  useCases: { listIssues: ListIssues; listOccurrences: ListOccurrences },
): void => {
  app.get<{ Params: { id: string }; Querystring: { severity?: Severity } }>(
    '/snapshots/:id/issues',
    { schema: issueListSchema },
    (request) => useCases.listIssues.execute(request.params.id, request.query),
  );
  app.get<{ Params: { id: string; checkId: number }; Querystring: PaginationQuery }>(
    '/snapshots/:id/issues/:checkId',
    { schema: occurrenceListSchema },
    async (request) => {
      const { items, ...paging } = await useCases.listOccurrences.execute(
        request.params.id,
        request.params.checkId,
        request.query,
      );
      return {
        ...paging,
        items: items.map(({ pageUrl, info }) => ({ pageUrl, info })),
      };
    },
  );
};
