export interface PageRequest {
  readonly page: number;
  readonly limit: number;
}

export interface Paginated<T> extends PageRequest {
  readonly items: readonly T[];
  readonly total: number;
}

export const paginate = <T>(items: readonly T[], { page, limit }: PageRequest): Paginated<T> => ({
  items: items.slice((page - 1) * limit, page * limit),
  total: items.length,
  page,
  limit,
});
