import type { ApiClient } from './api-client';
import { ApiUnreachable, Conflict, InvalidRequest, NotFound } from './errors';

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_OK = 200;
const DEFAULT_HEALTH_TIMEOUT_MS = 2000;

export interface FetchApiClientOptions {
  readonly healthTimeoutMs?: number;
}

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
  { healthTimeoutMs = DEFAULT_HEALTH_TIMEOUT_MS }: FetchApiClientOptions = {},
): ApiClient => {
  const request = async <T>(path: string, resource: string, init?: RequestInit): Promise<T> => {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, init);
    } catch (error) {
      throw new ApiUnreachable(error instanceof Error ? error.message : String(error));
    }
    if (response.status === HTTP_NOT_FOUND) throw new NotFound(resource);
    if (response.status === HTTP_BAD_REQUEST)
      throw new InvalidRequest(await readErrorMessage(response));
    if (response.status === HTTP_CONFLICT) throw new Conflict(await readErrorMessage(response));
    if (!response.ok) throw new ApiUnreachable(`HTTP ${String(response.status)}`);
    return (await response.json()) as T;
  };

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
