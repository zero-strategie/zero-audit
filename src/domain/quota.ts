export const FREE_MAX_PAGES = 100;
export const ADMIN_MAX_PAGES = 500;
export const FREE_AUDITS_PER_WINDOW = 3;
export const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface Allowance {
  readonly maxPages: number;
  /** Null when the account has no personal audit quota. */
  readonly auditsPerWindow: number | null;
}

export interface AuditQuota {
  /** Null when the account has no personal audit quota. */
  readonly remaining: number | null;
  /** When the next audit becomes possible; null while at least one audit remains. */
  readonly nextAvailableAt: Date | null;
}

export const allowanceOf = (isAdmin: boolean): Allowance =>
  isAdmin
    ? { maxPages: ADMIN_MAX_PAGES, auditsPerWindow: null }
    : { maxPages: FREE_MAX_PAGES, auditsPerWindow: FREE_AUDITS_PER_WINDOW };

/** `launches` are the start dates of the audits launched in the last `QUOTA_WINDOW_MS`, in any order. */
export const auditQuotaOf = (allowance: Allowance, launches: readonly Date[]): AuditQuota => {
  const { auditsPerWindow } = allowance;
  if (auditsPerWindow === null) return { remaining: null, nextAvailableAt: null };
  const remaining = Math.max(0, auditsPerWindow - launches.length);
  if (remaining > 0) return { remaining, nextAvailableAt: null };
  const oldestFirst = launches.map((date) => date.getTime()).sort((a, b) => a - b);
  const blocking = oldestFirst[launches.length - auditsPerWindow];
  return { remaining, nextAvailableAt: new Date((blocking ?? 0) + QUOTA_WINDOW_MS) };
};
