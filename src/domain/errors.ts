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

export class InvalidSnapshotTransition extends DomainError {
  constructor(snapshotId: string, status: string, action: string) {
    super(`Snapshot ${snapshotId} is ${status} and cannot be ${action}ed`);
    this.name = 'InvalidSnapshotTransition';
  }
}

export class SnapshotNotFound extends DomainError {
  constructor(snapshotId: string) {
    super(`Snapshot ${snapshotId} does not exist`);
    this.name = 'SnapshotNotFound';
  }
}

export class AuditAttemptLost extends DomainError {
  constructor(snapshotId: string, attempt: number) {
    super(`Snapshot ${snapshotId} is no longer running at attempt ${String(attempt)}`);
    this.name = 'AuditAttemptLost';
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

export class AuditAlreadyQueuedForAccount extends DomainError {
  constructor() {
    super('The account already has an audit queued or running');
    this.name = 'AuditAlreadyQueuedForAccount';
  }
}

export class QueueFull extends DomainError {
  constructor() {
    super('The audit queue is full');
    this.name = 'QueueFull';
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

export class InvalidEmail extends DomainError {
  constructor() {
    super('E-mail address is invalid');
    this.name = 'InvalidEmail';
  }
}

export class EmailAlreadyRegistered extends DomainError {
  constructor() {
    super('An account already exists for this e-mail address');
    this.name = 'EmailAlreadyRegistered';
  }
}

export class InvalidOrExpiredToken extends DomainError {
  constructor() {
    super('The token is unknown, already used or expired');
    this.name = 'InvalidOrExpiredToken';
  }
}

export class AuditInProgress extends DomainError {
  constructor() {
    super('An audit launched by this account is still running');
    this.name = 'AuditInProgress';
  }
}
