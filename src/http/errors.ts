import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AuditAlreadyRunning,
  HostNotResolved,
  InvalidAuditUrl,
  PrivateAddressRejected,
  ProjectNotFound,
  SnapshotNotFinished,
  SnapshotNotFound,
  SnapshotsFromDifferentProjects,
  UnknownCheck,
} from '../domain/errors.js';

export type ApiErrorCode = 'not_found' | 'invalid_request' | 'conflict' | 'internal_error';

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_INTERNAL_ERROR = 500;
const INTERNAL_MESSAGE = 'Internal server error';
const PRIVATE_ADDRESS_MESSAGE =
  'Adresse interne refusée : le site cible une adresse réseau non publique';
const HOST_NOT_RESOLVED_MESSAGE = 'Site introuvable : le nom de domaine ne résout pas';

const INVALID_URL_MESSAGE =
  'URL invalide : indiquez une adresse complète commençant par http:// ou https://, par exemple https://exemple.fr/';

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
        code: {
          type: 'string',
          enum: ['not_found', 'invalid_request', 'conflict', 'internal_error'],
        },
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
    if (error.validation) {
      const onUrl = error.validation.some((issue) => issue.instancePath === '/url');
      return send(
        reply,
        HTTP_BAD_REQUEST,
        'invalid_request',
        onUrl ? INVALID_URL_MESSAGE : error.message,
      );
    }
    if (
      error instanceof ProjectNotFound ||
      error instanceof SnapshotNotFound ||
      error instanceof UnknownCheck
    ) {
      return send(reply, HTTP_NOT_FOUND, 'not_found', error.message);
    }
    if (error instanceof SnapshotNotFinished || error instanceof SnapshotsFromDifferentProjects) {
      return send(reply, HTTP_BAD_REQUEST, 'invalid_request', error.message);
    }
    if (error instanceof PrivateAddressRejected) {
      return send(reply, HTTP_BAD_REQUEST, 'invalid_request', PRIVATE_ADDRESS_MESSAGE);
    }
    if (error instanceof InvalidAuditUrl) {
      return send(reply, HTTP_BAD_REQUEST, 'invalid_request', INVALID_URL_MESSAGE);
    }
    if (error instanceof HostNotResolved) {
      return send(reply, HTTP_BAD_REQUEST, 'invalid_request', HOST_NOT_RESOLVED_MESSAGE);
    }
    if (error instanceof AuditAlreadyRunning) {
      return send(reply, HTTP_CONFLICT, 'conflict', error.message);
    }
    request.log.error({ err: error }, 'Unhandled error');
    return send(reply, HTTP_INTERNAL_ERROR, 'internal_error', INTERNAL_MESSAGE);
  });
};
