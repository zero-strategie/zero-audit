import { defineMiddleware } from 'astro:middleware';
import { ApiUnreachable, Unauthenticated } from './lib/api/errors';
import { resolveApiBaseUrl } from './lib/api/config';
import { fetchApiClient } from './lib/api/fetch-api-client';
import { SESSION_COOKIE } from './lib/session-cookie';

const SESSION_COOKIE_PATH = { path: '/' };

/**
 * Builds a client per request (it carries the visitor's session and address) and resolves the
 * signed-in account. Tests of pages bypass this middleware and inject a fake client through locals.
 */
export const createSessionMiddleware = (baseUrl: string, fetchImpl: typeof fetch) =>
  defineMiddleware(async (context, next) => {
    const clientIp = context.request.headers.get('x-real-ip') ?? undefined;
    const sessionId = context.cookies.get(SESSION_COOKIE)?.value;
    context.locals.apiClient = fetchApiClient(baseUrl, fetchImpl, { sessionId, clientIp });
    context.locals.user = null;
    if (!sessionId) return next();
    try {
      context.locals.user = await context.locals.apiClient.getCurrentAccount();
    } catch (error) {
      if (error instanceof Unauthenticated) {
        context.cookies.delete(SESSION_COOKIE, SESSION_COOKIE_PATH);
        context.locals.apiClient = fetchApiClient(baseUrl, fetchImpl, { clientIp });
      } else if (!(error instanceof ApiUnreachable)) {
        throw error;
      }
    }
    return next();
  });

export const onRequest = createSessionMiddleware(resolveApiBaseUrl(process.env), fetch);
