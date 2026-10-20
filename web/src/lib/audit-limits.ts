export const ALLOWED_LIMITS = [50, 100, 250, 500] as const;
export const DEFAULT_LIMIT = 100;

const isAllowed = (limit: number): boolean => ALLOWED_LIMITS.some((allowed) => allowed === limit);

/** A relaunch reuses the previous page limit when the form still offers it. */
export const relaunchLimit = (previousLimit: number): number =>
  isAllowed(previousLimit) ? previousLimit : DEFAULT_LIMIT;
