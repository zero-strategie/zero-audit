import type { FastifyInstance } from 'fastify';
import type { Check } from '../../domain/check.js';

const checkListSchema = {
  response: {
    200: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'label', 'severity', 'theme'],
        properties: {
          id: { type: 'integer' },
          label: { type: 'string' },
          severity: { type: 'string' },
          theme: { type: 'string' },
        },
      },
    },
  },
} as const;

export const registerCheckRoutes = (app: FastifyInstance, checks: readonly Check[]): void => {
  app.get('/checks', { schema: checkListSchema }, () =>
    [...checks]
      .sort((a, b) => a.id - b.id)
      .map(({ id, label, severity, theme }) => ({ id, label, severity, theme })),
  );
};
