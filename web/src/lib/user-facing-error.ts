import {
  Conflict,
  Forbidden,
  InvalidRequest,
  ServiceUnavailable,
  TooManyRequests,
  Unauthenticated,
} from './api/errors';

/** Refusals whose French message, written by the API, is shown to the visitor as is. */
export const isUserFacingError = (error: unknown): error is Error =>
  error instanceof InvalidRequest ||
  error instanceof Unauthenticated ||
  error instanceof Forbidden ||
  error instanceof Conflict ||
  error instanceof TooManyRequests ||
  error instanceof ServiceUnavailable;
