const DEFAULT_API_URL = 'http://127.0.0.1:3000';

export const resolveApiBaseUrl = (env: Record<string, string | undefined>): string =>
  (env['ZERO_AUDIT_API_URL'] ?? DEFAULT_API_URL).replace(/\/+$/, '');
