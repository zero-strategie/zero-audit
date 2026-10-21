export class NotFound extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFound';
  }
}

export class ApiUnreachable extends Error {
  constructor(reason: string) {
    super(`API unreachable: ${reason}`);
    this.name = 'ApiUnreachable';
  }
}

export class InvalidRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRequest';
  }
}

export class Conflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Conflict';
  }
}

export class Unauthenticated extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Unauthenticated';
  }
}

export class Forbidden extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Forbidden';
  }
}

export class TooManyRequests extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TooManyRequests';
  }
}

export class ServiceUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceUnavailable';
  }
}
