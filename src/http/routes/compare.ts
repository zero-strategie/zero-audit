import type { FastifyInstance } from 'fastify';
import type { CompareSnapshots } from '../../application/compare-snapshots.js';
import { errorResponseSchema } from '../errors.js';
import { presentComparison } from '../presenters.js';

const compareSchema = {
  querystring: {
    type: 'object',
    required: ['a', 'b'],
    properties: { a: { type: 'string', minLength: 1 }, b: { type: 'string', minLength: 1 } },
  },
  response: { 400: errorResponseSchema, 404: errorResponseSchema },
} as const;

export const registerCompareRoutes = (
  app: FastifyInstance,
  useCases: { compareSnapshots: CompareSnapshots },
): void => {
  app.get<{ Querystring: { a: string; b: string } }>(
    '/compare',
    { schema: compareSchema },
    async (request) =>
      presentComparison(await useCases.compareSnapshots.execute(request.query.a, request.query.b)),
  );
};
