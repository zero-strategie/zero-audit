import type { FastifyInstance } from 'fastify';
import type { ListProjectSnapshots } from '../../application/list-project-snapshots.js';
import type { ListProjects } from '../../application/list-projects.js';
import { errorResponseSchema } from '../errors.js';
import type { ReaderOf } from '../reader.js';
import { presentProjectOverview, presentSnapshotListing } from '../presenters.js';

const nullableDate = { type: ['string', 'null'], format: 'date-time' } as const;

const projectListSchema = {
  response: {
    200: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'rootUrl', 'owned', 'createdAt', 'latestSnapshot', 'latestRun'],
        properties: {
          id: { type: 'string' },
          rootUrl: { type: 'string' },
          owned: { type: 'boolean' },
          createdAt: { type: 'string' },
          latestSnapshot: {
            type: ['object', 'null'],
            required: ['id', 'finishedAt', 'health'],
            properties: {
              id: { type: 'string' },
              finishedAt: nullableDate,
              health: { type: ['integer', 'null'] },
            },
          },
          latestRun: {
            type: ['object', 'null'],
            required: ['id', 'status', 'startedAt'],
            properties: {
              id: { type: 'string' },
              status: { type: 'string', enum: ['running', 'finished', 'failed'] },
              startedAt: { type: 'string' },
            },
          },
        },
      },
    },
  },
} as const;

const snapshotListSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  response: {
    200: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'status', 'startedAt', 'finishedAt', 'pagesCrawled', 'health'],
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['running', 'finished', 'failed'] },
          startedAt: { type: 'string' },
          finishedAt: nullableDate,
          pagesCrawled: { type: 'integer' },
          health: { type: ['integer', 'null'] },
        },
      },
    },
    400: errorResponseSchema,
    404: errorResponseSchema,
  },
} as const;

export const registerProjectRoutes = (
  app: FastifyInstance,
  useCases: { listProjects: ListProjects; listProjectSnapshots: ListProjectSnapshots },
  readerOf: ReaderOf,
): void => {
  app.get('/projects', { schema: projectListSchema }, async (request) =>
    (await useCases.listProjects.execute(await readerOf(request))).map(presentProjectOverview),
  );
  app.get<{ Params: { id: string } }>(
    '/projects/:id/snapshots',
    { schema: snapshotListSchema },
    async (request) =>
      (await useCases.listProjectSnapshots.execute(await readerOf(request), request.params.id)).map(
        presentSnapshotListing,
      ),
  );
};
