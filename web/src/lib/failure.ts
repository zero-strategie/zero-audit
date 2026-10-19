import { ApiUnreachable, InvalidRequest, NotFound } from './api/errors';

const HTTP_NOT_FOUND = 404;
const HTTP_BAD_GATEWAY = 502;

export type Failure = { kind: 'not-found'; status: 404 } | { kind: 'api-unreachable'; status: 502 };

/** Maps client errors to an error page; anything unexpected is rethrown. */
export const toFailure = (error: unknown): Failure => {
  if (error instanceof NotFound) return { kind: 'not-found', status: HTTP_NOT_FOUND };
  if (error instanceof ApiUnreachable || error instanceof InvalidRequest) {
    return { kind: 'api-unreachable', status: HTTP_BAD_GATEWAY };
  }
  throw error;
};
