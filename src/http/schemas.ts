export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export const snapshotIdParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', minLength: 1 } },
} as const;

export const paginationProperties = {
  page: { type: 'integer', minimum: 1, default: DEFAULT_PAGE },
  limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
} as const;

export interface PaginationQuery {
  page: number;
  limit: number;
}

export const pageEnvelope = (itemSchema: object) =>
  ({
    type: 'object',
    required: ['items', 'total', 'page', 'limit'],
    properties: {
      items: { type: 'array', items: itemSchema },
      total: { type: 'integer' },
      page: { type: 'integer' },
      limit: { type: 'integer' },
    },
  }) as const;
