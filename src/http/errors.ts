import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ProjectNotFound, SnapshotNotFound } from '../domain/errors.js';

export type ApiErrorCode = 'not_found' | 'invalid_request' | 'internal_error';

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL_ERROR = 500;
const INTERNAL_MESSAGE = 'Internal server error';

const send = (reply: FastifyReply, status: number, code: ApiErrorCode, message: string) =>
  reply.status(status).send({ error: { code, message } });

export const errorResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', enum: ['not_found', 'invalid_request', 'internal_error'] },
        message: { type: 'string' },
      },
    },
  },
} as const;

export const registerErrorHandlers = (app: FastifyInstance): void => {
  app.setNotFoundHandler((request: FastifyRequest, reply) =>
    send(reply, HTTP_NOT_FOUND, 'not_found', `Route ${request.method} ${request.url} not found`),
  );
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) return send(reply, HTTP_BAD_REQUEST, 'invalid_request', error.message);
    if (error instanceof ProjectNotFound || error instanceof SnapshotNotFound) {
      return send(reply, HTTP_NOT_FOUND, 'not_found', error.message);
    }
    request.log.error({ err: error }, 'Unhandled error');
    return send(reply, HTTP_INTERNAL_ERROR, 'internal_error', INTERNAL_MESSAGE);
  });
};
