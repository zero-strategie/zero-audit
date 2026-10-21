import type { FastifyInstance } from 'fastify';
import type { ConfirmPasswordReset } from '../../application/auth/confirm-password-reset.js';
import type { DeleteAccount } from '../../application/auth/delete-account.js';
import type { GetCurrentAccount } from '../../application/auth/get-current-account.js';
import type { Login } from '../../application/auth/login.js';
import type { Logout } from '../../application/auth/logout.js';
import type { RegisterAccount } from '../../application/auth/register-account.js';
import type { RequestPasswordReset } from '../../application/auth/request-password-reset.js';
import type { ResendVerification } from '../../application/auth/resend-verification.js';
import type { VerifyEmail } from '../../application/auth/verify-email.js';
import { MAX_EMAIL_LENGTH } from '../../domain/user.js';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../../domain/password-policy.js';
import { clientIpOf } from '../client-ip.js';
import { errorResponseSchema } from '../errors.js';

const HTTP_OK = 200;
const HTTP_ACCEPTED = 202;
const HTTP_NO_CONTENT = 204;
const SESSION_HEADER = 'x-session-id';
const MAX_TOKEN_LENGTH = 256;
const GENERIC_ACCEPTED_MESSAGE =
  'Si cette adresse peut être utilisée, un e-mail vient de vous être envoyé';

const emailProperty = { type: 'string', maxLength: MAX_EMAIL_LENGTH } as const;
const sessionHeaders = {
  type: 'object',
  properties: { [SESSION_HEADER]: { type: 'string', maxLength: MAX_TOKEN_LENGTH } },
} as const;
const messageSchema = {
  type: 'object',
  required: ['message'],
  properties: { message: { type: 'string' } },
} as const;
const sessionSchema = {
  type: 'object',
  required: ['sessionId'],
  properties: { sessionId: { type: 'string' } },
} as const;

const registerSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: emailProperty,
      password: {
        type: 'string',
        minLength: MIN_PASSWORD_LENGTH,
        maxLength: MAX_PASSWORD_LENGTH,
      },
      website: { type: 'string', maxLength: MAX_TOKEN_LENGTH },
    },
  },
  response: {
    202: messageSchema,
    400: errorResponseSchema,
    429: errorResponseSchema,
    503: errorResponseSchema,
  },
} as const;

const resendSchema = {
  body: { type: 'object', required: ['email'], properties: { email: emailProperty } },
  response: { 202: messageSchema, 400: errorResponseSchema, 503: errorResponseSchema },
} as const;

const verifySchema = {
  body: {
    type: 'object',
    required: ['token'],
    properties: { token: { type: 'string', minLength: 1, maxLength: MAX_TOKEN_LENGTH } },
  },
  response: { 200: sessionSchema, 400: errorResponseSchema },
} as const;

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: emailProperty,
      password: { type: 'string', minLength: 1, maxLength: MAX_PASSWORD_LENGTH },
    },
  },
  response: {
    200: sessionSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    429: errorResponseSchema,
  },
} as const;

const logoutSchema = {
  headers: sessionHeaders,
  response: { 204: { type: 'null' }, 401: errorResponseSchema },
} as const;

const meSchema = {
  headers: sessionHeaders,
  response: {
    200: {
      type: 'object',
      required: ['email', 'isAdmin'],
      properties: { email: { type: 'string' }, isAdmin: { type: 'boolean' } },
    },
    401: errorResponseSchema,
  },
} as const;

const passwordResetRequestSchema = resendSchema;

const passwordResetConfirmSchema = {
  body: {
    type: 'object',
    required: ['token', 'password'],
    properties: {
      token: { type: 'string', minLength: 1, maxLength: MAX_TOKEN_LENGTH },
      password: { type: 'string', minLength: MIN_PASSWORD_LENGTH, maxLength: MAX_PASSWORD_LENGTH },
    },
  },
  response: { 204: { type: 'null' }, 400: errorResponseSchema },
} as const;

const deleteAccountSchema = {
  headers: sessionHeaders,
  body: {
    type: 'object',
    required: ['password'],
    properties: { password: { type: 'string', minLength: 1, maxLength: MAX_PASSWORD_LENGTH } },
  },
  response: {
    204: { type: 'null' },
    400: errorResponseSchema,
    401: errorResponseSchema,
    409: errorResponseSchema,
  },
} as const;

export interface AuthUseCases {
  readonly registerAccount: RegisterAccount;
  readonly resendVerification: ResendVerification;
  readonly verifyEmail: VerifyEmail;
  readonly login: Login;
  readonly logout: Logout;
  readonly getCurrentAccount: GetCurrentAccount;
  readonly requestPasswordReset: RequestPasswordReset;
  readonly confirmPasswordReset: ConfirmPasswordReset;
  readonly deleteAccount: DeleteAccount;
}

export const registerAuthRoutes = (app: FastifyInstance, useCases: AuthUseCases): void => {
  app.post<{ Body: { email: string; password: string; website?: string } }>(
    '/auth/register',
    { schema: registerSchema },
    async (request, reply) => {
      await useCases.registerAccount.execute({ ...request.body, ip: clientIpOf(request) });
      return reply.status(HTTP_ACCEPTED).send({ message: GENERIC_ACCEPTED_MESSAGE });
    },
  );
  app.post<{ Body: { email: string } }>(
    '/auth/resend-verification',
    { schema: resendSchema },
    async (request, reply) => {
      await useCases.resendVerification.execute(request.body);
      return reply.status(HTTP_ACCEPTED).send({ message: GENERIC_ACCEPTED_MESSAGE });
    },
  );
  app.post<{ Body: { token: string } }>(
    '/auth/verify-email',
    { schema: verifySchema },
    async (request, reply) => {
      const sessionId = await useCases.verifyEmail.execute(request.body.token);
      return reply.status(HTTP_OK).send({ sessionId });
    },
  );
  app.post<{ Body: { email: string; password: string } }>(
    '/auth/login',
    { schema: loginSchema },
    async (request, reply) => {
      const sessionId = await useCases.login.execute({ ...request.body, ip: clientIpOf(request) });
      return reply.status(HTTP_OK).send({ sessionId });
    },
  );
  app.post('/auth/logout', { schema: logoutSchema }, async (request, reply) => {
    await useCases.logout.execute(sessionIdOf(request.headers));
    return reply.status(HTTP_NO_CONTENT).send();
  });
  app.post<{ Body: { email: string } }>(
    '/auth/password-reset/request',
    { schema: passwordResetRequestSchema },
    async (request, reply) => {
      await useCases.requestPasswordReset.execute(request.body);
      return reply.status(HTTP_ACCEPTED).send({ message: GENERIC_ACCEPTED_MESSAGE });
    },
  );
  app.post<{ Body: { token: string; password: string } }>(
    '/auth/password-reset/confirm',
    { schema: passwordResetConfirmSchema },
    async (request, reply) => {
      await useCases.confirmPasswordReset.execute(request.body);
      return reply.status(HTTP_NO_CONTENT).send();
    },
  );
  app.delete<{ Body: { password: string } }>(
    '/auth/me',
    { schema: deleteAccountSchema },
    async (request, reply) => {
      await useCases.deleteAccount.execute({
        sessionId: sessionIdOf(request.headers),
        password: request.body.password,
      });
      return reply.status(HTTP_NO_CONTENT).send();
    },
  );
  app.get('/auth/me', { schema: meSchema }, async (request, reply) => {
    const account = await useCases.getCurrentAccount.execute(sessionIdOf(request.headers));
    return reply.status(HTTP_OK).send(account);
  });
};

const sessionIdOf = (headers: Record<string, unknown>): string | undefined => {
  const value = headers[SESSION_HEADER];
  return typeof value === 'string' ? value : undefined;
};
