export interface Project {
  readonly id: string;
  /** Normalized root URL entered by the user; `UNKNOWN_PROJECT_ROOT_URL` for pre-project snapshots. */
  readonly rootUrl: string;
  readonly createdAt: Date;
}

/**
 * Sentinel root URL of the project that adopts milestone 1 snapshots without any crawled page.
 * It is not a valid http(s) URL, so it can never collide with a real project.
 */
export const UNKNOWN_PROJECT_ROOT_URL = 'unknown:';
