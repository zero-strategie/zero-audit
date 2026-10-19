import type { FastifyInstance } from 'fastify';
import type { GetSnapshotReport } from '../../application/get-snapshot-report.js';
import { errorResponseSchema } from '../errors.js';
import { presentSnapshotReport } from '../presenters.js';

const scoreSchema = {
  type: 'object',
  required: ['score', 'variation'],
  properties: {
    score: { type: ['integer', 'null'] },
    variation: { type: ['integer', 'null'] },
  },
} as const;

const groupSchema = {
  type: 'object',
  required: ['count', 'variation'],
  properties: { count: { type: 'integer' }, variation: { type: ['integer', 'null'] } },
} as const;

const reportSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', minLength: 1 } },
  },
  response: {
    200: {
      type: 'object',
      required: ['snapshot', 'health', 'themes', 'counts', 'pageGroups', 'siteFiles', 'topIssues'],
      properties: {
        snapshot: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            projectId: { type: 'string' },
            status: { type: 'string' },
            startedAt: { type: 'string' },
            finishedAt: { type: ['string', 'null'] },
            pagesCrawled: { type: 'integer' },
            pagesLimit: { type: 'integer' },
          },
        },
        health: scoreSchema,
        themes: {
          type: 'object',
          properties: Object.fromEntries(
            ['crawlability', 'https', 'linking', 'on-page', 'other'].map((theme) => [
              theme,
              scoreSchema,
            ]),
          ),
        },
        counts: {
          type: 'object',
          properties: {
            errors: { type: 'integer' },
            warnings: { type: 'integer' },
            notices: { type: 'integer' },
          },
        },
        pageGroups: {
          type: 'object',
          properties: Object.fromEntries(
            ['healthy', 'have-issues', 'broken', 'redirect', 'blocked'].map((group) => [
              group,
              groupSchema,
            ]),
          ),
        },
        siteFiles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string' },
              url: { type: 'string' },
              status: { type: ['integer', 'null'] },
              error: { type: ['string', 'null'] },
            },
          },
        },
        topIssues: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              checkId: { type: 'integer' },
              label: { type: 'string' },
              severity: { type: 'string' },
              theme: { type: 'string' },
              count: { type: 'integer' },
              delta: { type: 'integer' },
            },
          },
        },
      },
    },
    404: errorResponseSchema,
  },
} as const;

export const registerSnapshotRoutes = (
  app: FastifyInstance,
  useCases: { getSnapshotReport: GetSnapshotReport },
): void => {
  app.get<{ Params: { id: string } }>('/snapshots/:id', { schema: reportSchema }, async (request) =>
    presentSnapshotReport(await useCases.getSnapshotReport.execute(request.params.id)),
  );
};
