const FIRST_PAGE = 1;

export interface PaginationLinks {
  previous: number | null;
  next: number | null;
}

export const buildPaginationLinks = (
  page: number,
  limit: number,
  total: number,
): PaginationLinks => ({
  previous: page > FIRST_PAGE ? page - 1 : null,
  next: page * limit < total ? page + 1 : null,
});

/** Anything that is not a positive integer falls back to the first page. */
export const parsePageParam = (raw: string | null): number => {
  if (raw === null || !/^\d+$/.test(raw)) return FIRST_PAGE;
  const page = Number(raw);
  return page >= FIRST_PAGE ? page : FIRST_PAGE;
};
