import type { ApiClient } from './api-client';
import {
  ApiUnreachable,
  Conflict,
  Forbidden,
  InvalidRequest,
  NotFound,
  ServiceUnavailable,
  TooManyRequests,
  Unauthenticated,
} from './errors';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVICE_UNAVAILABLE = 503;
const HTTP_NO_CONTENT = 204;
const HTTP_OK = 200;
const DEFAULT_HEALTH_TIMEOUT_MS = 2000;

export interface FetchApiClientOptions {
  readonly healthTimeoutMs?: number;
  /** Session of the visitor, sent as `X-Session-Id`. */
  readonly sessionId?: string | undefined;
  /** Address of the visitor, relayed as `X-Real-IP` for the API's rate limits. */
  readonly clientIp?: string | undefined;
}

const ERROR_BY_STATUS: ReadonlyMap<number, new (message: string) => Error> = new Map([
  [HTTP_BAD_REQUEST, InvalidRequest],
  [HTTP_UNAUTHORIZED, Unauthenticated],
  [HTTP_FORBIDDEN, Forbidden],
  [HTTP_CONFLICT, Conflict],
  [HTTP_TOO_MANY_REQUESTS, TooManyRequests],
  [HTTP_SERVICE_UNAVAILABLE, ServiceUnavailable],
]);

const readErrorMessage = async (response: Response): Promise<string> => {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } };
    return typeof parsed.error?.message === 'string' ? parsed.error.message : body;
  } catch {
    return body;
  }
};

export const fetchApiClient = (
  baseUrl: string,
  fetchImpl: typeof fetch,
  { healthTimeoutMs = DEFAULT_HEALTH_TIMEOUT_MS, sessionId, clientIp }: FetchApiClientOptions = {},
): ApiClient => {
  const identityHeaders: Record<string, string> = {
    ...(sessionId ? { 'x-session-id': sessionId } : {}),
    ...(clientIp ? { 'x-real-ip': clientIp } : {}),
  };

  const request = async <T>(path: string, resource: string, init: RequestInit = {}): Promise<T> => {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: { ...identityHeaders, ...(init.headers as Record<string, string> | undefined) },
      });
    } catch (error) {
      throw new ApiUnreachable(error instanceof Error ? error.message : String(error));
    }
    if (response.status === HTTP_NOT_FOUND) throw new NotFound(resource);
    const ErrorClass = ERROR_BY_STATUS.get(response.status);
    if (ErrorClass) throw new ErrorClass(await readErrorMessage(response));
    if (!response.ok) throw new ApiUnreachable(`HTTP ${String(response.status)}`);
    if (response.status === HTTP_NO_CONTENT) return undefined as T;
    return (await response.json()) as T;
  };

  const sendJson = <T>(method: string, path: string, body: unknown): Promise<T> =>
    request(path, 'Account', {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  const sendForMessage = async (path: string, body: unknown): Promise<string> =>
    (await sendJson<{ message: string }>('POST', path, body)).message;

  const sendForSession = async (path: string, body: unknown): Promise<string> =>
    (await sendJson<{ sessionId: string }>('POST', path, body)).sessionId;

  const get = <T>(path: string, resource: string): Promise<T> => request(path, resource);

  const checkHealth = async (): Promise<boolean> => {
    try {
      const response = await fetchImpl(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(healthTimeoutMs),
      });
      return response.status === HTTP_OK;
    } catch {
      return false;
    }
  };

  return {
    checkHealth,
    register: (input) => sendForMessage('/auth/register', input),
    resendVerification: (email) => sendForMessage('/auth/resend-verification', { email }),
    verifyEmail: (token) => sendForSession('/auth/verify-email', { token }),
    login: (input) => sendForSession('/auth/login', input),
    logout: () => request('/auth/logout', 'Account', { method: 'POST' }),
    getCurrentAccount: () => get('/auth/me', 'Account'),
    requestPasswordReset: (email) => sendForMessage('/auth/password-reset/request', { email }),
    confirmPasswordReset: (input) => sendJson('POST', '/auth/password-reset/confirm', input),
    deleteAccount: (password) => sendJson('DELETE', '/auth/me', { password }),
    startAudit: (input) =>
      request('/audits', 'Audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    getAuditProgress: (snapshotId) =>
      get(`/snapshots/${encodeURIComponent(snapshotId)}/progress`, 'Snapshot'),
    listProjects: () => get('/projects', 'Projects'),
    getSnapshotReport: (snapshotId) =>
      get(`/snapshots/${encodeURIComponent(snapshotId)}`, 'Snapshot'),
    listIssues: (snapshotId, severity) =>
      get(
        `/snapshots/${encodeURIComponent(snapshotId)}/issues${severity ? `?severity=${severity}` : ''}`,
        'Snapshot',
      ),
    getOccurrences: (snapshotId, checkId, page) =>
      get(
        `/snapshots/${encodeURIComponent(snapshotId)}/issues/${String(checkId)}?page=${String(page)}`,
        'Issue',
      ),
    listPages: (snapshotId, page, sort) =>
      get(
        `/snapshots/${encodeURIComponent(snapshotId)}/pages?page=${String(page)}&sort=${encodeURIComponent(sort)}`,
        'Snapshot',
      ),
    listProjectSnapshots: (projectId) =>
      get(`/projects/${encodeURIComponent(projectId)}/snapshots`, 'Project'),
    compare: (baseId, targetId) =>
      get(`/compare?a=${encodeURIComponent(baseId)}&b=${encodeURIComponent(targetId)}`, 'Snapshot'),
  };
};
