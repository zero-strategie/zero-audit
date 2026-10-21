/** Absolute lifetime: a session is never extended by activity. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface Session {
  /** SHA-256 of the identifier held by the browser; the identifier itself is never stored. */
  readonly idHash: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}
