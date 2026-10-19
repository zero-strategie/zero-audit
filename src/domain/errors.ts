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
