export interface AuditStarted {
  readonly snapshotId: string;
  readonly rootUrl: string;
}

export interface AuditFinished extends AuditStarted {
  readonly pagesCount: number;
  /** Rounded health score, null when it cannot be computed. */
  readonly health: number | null;
}

/** Operational trace of audits, meant for the logs of a scheduled run. */
export interface AuditEvents {
  started(event: AuditStarted): void;
  finished(event: AuditFinished): void;
  failed(event: AuditStarted): void;
}
