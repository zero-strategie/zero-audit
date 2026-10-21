/**
 * Kept apart from `SnapshotRepository`, which stays append-only: erasing an account is the only way
 * audit data ever disappears.
 */
export interface AccountEraser {
  /**
   * Atomically removes the account with its sessions, tokens, projects, snapshots and everything
   * recorded under them. Data of other accounts and of the showcase is never touched.
   */
  eraseAccount(userId: string): Promise<void>;
  /** Erases every account still unverified and created strictly before `date`; returns their count. */
  purgeUnverifiedBefore(date: Date): Promise<number>;
}
