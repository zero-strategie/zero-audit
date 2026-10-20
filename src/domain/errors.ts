export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export class RootUnreachable extends DomainError {
  constructor(rootUrl: string, reason: string) {
    super(`Root URL ${rootUrl} is unreachable: ${reason}`);
    this.name = 'RootUnreachable';
  }
}

export class SnapshotImmutable extends DomainError {
  constructor(snapshotId: string, status: string) {
    super(`Snapshot ${snapshotId} is ${status} and can no longer be written`);
    this.name = 'SnapshotImmutable';
  }
}

export class SnapshotNotFound extends DomainError {
  constructor(snapshotId: string) {
    super(`Snapshot ${snapshotId} does not exist`);
    this.name = 'SnapshotNotFound';
  }
}

export class SnapshotsFromDifferentProjects extends DomainError {
  constructor(baseId: string, targetId: string) {
    super(`Snapshots ${baseId} and ${targetId} do not belong to the same project`);
    this.name = 'SnapshotsFromDifferentProjects';
  }
}

export class SnapshotNotFinished extends DomainError {
  constructor(snapshotId: string, status: string) {
    super(`Snapshot ${snapshotId} is ${status}, not finished`);
    this.name = 'SnapshotNotFinished';
  }
}

export class ProjectNotFound extends DomainError {
  constructor(projectId: string) {
    super(`Project ${projectId} does not exist`);
    this.name = 'ProjectNotFound';
  }
}

export class UnknownCheck extends DomainError {
  constructor(checkId: number) {
    super(`Check ${String(checkId)} does not exist`);
    this.name = 'UnknownCheck';
  }
}

export class PrivateAddressRejected extends DomainError {
  constructor(
    readonly host: string,
    readonly address: string,
  ) {
    super(`Host ${host} resolves to a non-public address (${address})`);
    this.name = 'PrivateAddressRejected';
  }
}

export class AuditAlreadyRunning extends DomainError {
  constructor(readonly startedAt: Date) {
    super(`An audit is already running since ${startedAt.toISOString()}`);
    this.name = 'AuditAlreadyRunning';
  }
}

export class HostNotResolved extends DomainError {
  constructor(readonly host: string) {
    super(`Host ${host} does not resolve`);
    this.name = 'HostNotResolved';
  }
}

export class InvalidAuditUrl extends DomainError {
  constructor(readonly url: string) {
    super('Audit URL is not a complete http(s) address');
    this.name = 'InvalidAuditUrl';
  }
}
