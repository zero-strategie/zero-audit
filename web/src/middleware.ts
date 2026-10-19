import { defineMiddleware } from 'astro:middleware';
import { resolveApiBaseUrl } from './lib/api/config';
import { fetchApiClient } from './lib/api/fetch-api-client';

const defaultClient = fetchApiClient(resolveApiBaseUrl(process.env), fetch);

// Tests bypass this middleware and inject a fake client through locals.
export const onRequest = defineMiddleware((context, next) => {
  context.locals.apiClient = defaultClient;
  return next();
});
