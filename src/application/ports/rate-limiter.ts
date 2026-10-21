/** Counts events per key over a sliding window. Callers build keys without personal data in clear text when logged. */
export interface RateLimiter {
  /** Records one event for the key; it stops counting once `windowMs` has elapsed. */
  hit(key: string, windowMs: number): void;
  /** True when `limit` events or more were recorded for the key within the last `windowMs`. */
  isBlocked(key: string, limit: number, windowMs: number): boolean;
}
