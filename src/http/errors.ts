import { formatParisDateTime } from './format-date.js';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AuditAlreadyQueuedForAccount,
  AuditInProgress,
  EmailNotVerified,
  HostNotResolved,
  InvalidAuditUrl,
  InvalidEmail,
  InvalidOrExpiredToken,
  InvalidPassword,
  MailerUnavailable,
  PrivateAddressRejected,
  ProjectNotFound,
  QueueFull,
  QuotaExceeded,
  SnapshotNotFinished,
  SnapshotNotFound,
  SnapshotsFromDifferentProjects,
  TooManyAttempts,
  Unauthenticated,
  UnknownCheck,
} from '../domain/errors.js';

export type ApiErrorCode =
  | 'not_found'
  | 'invalid_request'
  | 'unauthenticated'
  | 'forbidden'
  | 'conflict'
  | 'too_many_attempts'
  | 'quota_exceeded'
  | 'unavailable'
  | 'internal_error';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_INTERNAL_ERROR = 500;
const HTTP_SERVICE_UNAVAILABLE = 503;
const INTERNAL_MESSAGE = 'Internal server error';
const PRIVATE_ADDRESS_MESSAGE =
  'Adresse interne refusée : le site cible une adresse réseau non publique';
const AUDIT_ALREADY_QUEUED_MESSAGE = 'Vous avez déjà un audit en cours ou en file';
const QUEUE_FULL_MESSAGE = "La file d'attente est pleine";
const HOST_NOT_RESOLVED_MESSAGE = 'Site introuvable : le nom de domaine ne résout pas';

const INVALID_URL_MESSAGE =
  'URL invalide : indiquez une adresse complète commençant par http:// ou https://, par exemple https://exemple.fr/';

const INVALID_EMAIL_MESSAGE = 'Adresse e-mail invalide';
const INVALID_PASSWORD_MESSAGE = 'Le mot de passe doit contenir entre 12 et 128 caractères';
const BAD_CREDENTIALS_MESSAGE = 'E-mail ou mot de passe incorrect';
const SESSION_REQUIRED_MESSAGE = 'Connexion requise';
const EMAIL_NOT_VERIFIED_MESSAGE = "Confirmez d'abord votre adresse e-mail";
const INVALID_TOKEN_MESSAGE = 'Ce lien est invalide ou a expiré';
const AUDIT_IN_PROGRESS_MESSAGE = 'Un audit est en cours, réessayez à la fin';
const TOO_MANY_ATTEMPTS_MESSAGE = 'Trop de tentatives, réessayez dans quelques minutes';
const GLOBAL_QUOTA_MESSAGE =
  "Le service a atteint sa limite quotidienne d'audits, réessayez dans quelques heures";
const SIGN_UP_UNAVAILABLE_MESSAGE = 'Les inscriptions sont momentanément indisponibles';

const quotaMessage = ({ denial }: QuotaExceeded): string => {
  if (denial.reason === 'pages') {
    return `Votre compte permet ${String(denial.maxPages)} pages par audit`;
  }
  if (denial.reason === 'account') {
    return `Votre quota d'audits est atteint : prochain audit possible le ${formatParisDateTime(denial.nextAvailableAt)}`;
  }
  return GLOBAL_QUOTA_MESSAGE;
};

/** Message of a body validation failure, in French for the fields filled in by visitors. */
const validationMessage = (error: FastifyError): string => {
  const paths = error.validation?.map((issue) => issue.instancePath) ?? [];
  if (paths.includes('/url')) return INVALID_URL_MESSAGE;
  if (paths.includes('/email')) return INVALID_EMAIL_MESSAGE;
  if (paths.includes('/password')) return INVALID_PASSWORD_MESSAGE;
  return error.message;
};

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
          enum: [
            'not_found',
            'invalid_request',
            'unauthenticated',
            'forbidden',
            'conflict',
            'too_many_attempts',
            'quota_exceeded',
            'unavailable',
            'internal_error',
          ],
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
      return send(reply, HTTP_BAD_REQUEST, 'invalid_request', validationMessage(error));
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
    if (error instanceof InvalidEmail) {
      return send(reply, HTTP_BAD_REQUEST, 'invalid_request', INVALID_EMAIL_MESSAGE);
    }
    if (error instanceof InvalidPassword) {
      return send(reply, HTTP_BAD_REQUEST, 'invalid_request', INVALID_PASSWORD_MESSAGE);
    }
    if (error instanceof InvalidOrExpiredToken) {
      return send(reply, HTTP_BAD_REQUEST, 'invalid_request', INVALID_TOKEN_MESSAGE);
    }
    if (error instanceof Unauthenticated) {
      const message =
        error.reason === 'no-session' ? SESSION_REQUIRED_MESSAGE : BAD_CREDENTIALS_MESSAGE;
      return send(reply, HTTP_UNAUTHORIZED, 'unauthenticated', message);
    }
    if (error instanceof EmailNotVerified) {
      return send(reply, HTTP_FORBIDDEN, 'forbidden', EMAIL_NOT_VERIFIED_MESSAGE);
    }
    if (error instanceof MailerUnavailable) {
      return send(reply, HTTP_SERVICE_UNAVAILABLE, 'unavailable', SIGN_UP_UNAVAILABLE_MESSAGE);
    }
    if (error instanceof TooManyAttempts) {
      return send(reply, HTTP_TOO_MANY_REQUESTS, 'too_many_attempts', TOO_MANY_ATTEMPTS_MESSAGE);
    }
    if (error instanceof QuotaExceeded) {
      return send(reply, HTTP_TOO_MANY_REQUESTS, 'quota_exceeded', quotaMessage(error));
    }
    if (error instanceof AuditInProgress) {
      return send(reply, HTTP_CONFLICT, 'conflict', AUDIT_IN_PROGRESS_MESSAGE);
    }
    if (error instanceof AuditAlreadyQueuedForAccount) {
      return send(reply, HTTP_CONFLICT, 'conflict', AUDIT_ALREADY_QUEUED_MESSAGE);
    }
    if (error instanceof QueueFull) {
      return send(reply, HTTP_TOO_MANY_REQUESTS, 'quota_exceeded', QUEUE_FULL_MESSAGE);
    }
    request.log.error({ err: error }, 'Unhandled error');
    return send(reply, HTTP_INTERNAL_ERROR, 'internal_error', INTERNAL_MESSAGE);
  });
};
