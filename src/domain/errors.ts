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
