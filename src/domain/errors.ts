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

export class InvalidPassword extends DomainError {
  constructor() {
    super('Password must be between 12 and 128 characters long');
    this.name = 'InvalidPassword';
  }
}

export class MailDeliveryFailed extends DomainError {
  constructor(reason: string) {
    super(`E-mail delivery failed: ${reason}`);
    this.name = 'MailDeliveryFailed';
  }
}

export class MailerUnavailable extends DomainError {
  constructor() {
    super('No mailer is configured');
    this.name = 'MailerUnavailable';
  }
}

export type UnauthenticatedReason = 'bad-credentials' | 'no-session';

export class Unauthenticated extends DomainError {
  constructor(readonly reason: UnauthenticatedReason = 'bad-credentials') {
    super('Authentication is required or the credentials are wrong');
    this.name = 'Unauthenticated';
  }
}

export class EmailNotVerified extends DomainError {
  constructor() {
    super('The e-mail address of this account is not verified');
    this.name = 'EmailNotVerified';
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

export class TooManyAttempts extends DomainError {
  constructor() {
    super('Too many attempts, try again later');
    this.name = 'TooManyAttempts';
  }
}

export type QuotaDenial =
  | { readonly reason: 'pages'; readonly maxPages: number }
  | { readonly reason: 'account'; readonly nextAvailableAt: Date }
  | { readonly reason: 'global' };

export class QuotaExceeded extends DomainError {
  constructor(readonly denial: QuotaDenial) {
    super(`Audit quota exceeded (${denial.reason})`);
    this.name = 'QuotaExceeded';
  }
}
