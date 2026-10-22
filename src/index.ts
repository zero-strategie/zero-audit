// Public surface of the library (1.0.0 contract): every export is named explicitly, and
// tests/public-api.test.ts must be updated deliberately when this list changes.

// Composition
export { createStorage, migrateStorage } from './composition/storage.js';
export type {
  Storage,
  StorageConfig,
  StorageConnection,
  StorageFactory,
  StoreKind,
  StoreSelection,
} from './composition/storage.js';
export { createAuditWorker, createRunAudit } from './composition/audit.js';
export type { AuditWorkerOptions, RunAuditOptions } from './composition/audit.js';
export { runCli } from './cli/run-cli.js';
export type { CliHooks, CliIo } from './cli/run-cli.js';

// Use cases
export { AssertPublicTarget } from './application/assert-public-target.js';
export { AwaitAudit } from './application/await-audit.js';
export { CheckHealth } from './application/check-health.js';
export { CheckWorkerHealth } from './application/check-worker-health.js';
export { CompareSnapshots } from './application/compare-snapshots.js';
export type { SnapshotComparison } from './application/compare-snapshots.js';
export { GetAuditProgress } from './application/get-audit-progress.js';
export type { AuditProgress } from './application/get-audit-progress.js';
export { GetSnapshotReport } from './application/get-snapshot-report.js';
export type { SnapshotReport } from './application/get-snapshot-report.js';
export { ListIssues } from './application/list-issues.js';
export type { IssueRow } from './application/list-issues.js';
export { ListOccurrences } from './application/list-occurrences.js';
export { ListPages } from './application/list-pages.js';
export type { PageRow } from './application/list-pages.js';
export { ListProjectSnapshots } from './application/list-project-snapshots.js';
export type { SnapshotListing } from './application/list-project-snapshots.js';
export { ListProjects } from './application/list-projects.js';
export type { ProjectOverview } from './application/list-projects.js';
export { ProcessAuditQueue } from './application/process-audit-queue.js';
export { QueueAudit } from './application/queue-audit.js';
export type { QueuedAudit } from './application/queue-audit.js';
export { RecoverStaleAudits } from './application/recover-stale-audits.js';
export { AuditInterrupted, RunAudit } from './application/run-audit.js';
export type { AuditRequest } from './application/run-audit.js';

// Ports
export type { Admission, AdmissionView, AuditQueue } from './application/ports/audit-queue.js';
export type { AuditEvents } from './application/ports/audit-events.js';
export type { Clock } from './application/ports/clock.js';
export type { HostResolver } from './application/ports/host-resolver.js';
export type { HttpClient } from './application/ports/http-client.js';
export type { Logger } from './application/ports/logger.js';
export type { ProjectRepository } from './application/ports/project-repository.js';
export type {
  SnapshotDetails,
  SnapshotRepository,
} from './application/ports/snapshot-repository.js';
export type { StorageHealth } from './application/ports/storage-health.js';

// Adapters
export { DnsHostResolver } from './infrastructure/dns-host-resolver.js';

// Domain
export { allChecks } from './domain/checks/index.js';
export type { Check, CheckResult, Severity, Theme } from './domain/check.js';
export { HostNotResolved, InvalidAuditUrl, PrivateAddressRejected } from './domain/errors.js';
export { isPublicAddress } from './domain/network-address.js';
export type { Project } from './domain/project.js';
export { UNKNOWN_PROJECT_ROOT_URL } from './domain/project.js';
export { ANONYMOUS_READER, canRead } from './domain/reader.js';
export type { Reader } from './domain/reader.js';
export {
  SEVERITY_WEIGHTS,
  buildScoreCard,
  computeHealth,
  computeThemeScores,
  passRate,
  roundScore,
  scoreVariation,
} from './domain/scoring.js';
export type { ScoreCard, ThemeScores } from './domain/scoring.js';
export { Snapshot } from './domain/snapshot.js';
export type { SnapshotStatus } from './domain/snapshot.js';
export { countBySeverity, topIssues } from './domain/top-issues.js';
