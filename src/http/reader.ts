import type { FastifyRequest } from 'fastify';
import type { ResolveReader } from '../application/auth/resolve-reader.js';
import type { Reader } from '../domain/reader.js';

export const SESSION_HEADER = 'x-session-id';

export const sessionIdOf = (headers: Record<string, unknown>): string | undefined => {
  const value = headers[SESSION_HEADER];
  return typeof value === 'string' ? value : undefined;
};

/** Resolves who is reading from the session header; the routes only hand it to the use cases. */
export type ReaderOf = (request: FastifyRequest) => Promise<Reader>;

export const buildReaderOf =
  (resolveReader: ResolveReader): ReaderOf =>
  (request) =>
    resolveReader.execute(sessionIdOf(request.headers));
