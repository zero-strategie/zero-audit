import type { ApiClient } from './api-client';
import { ApiUnreachable, InvalidRequest, NotFound } from './errors';

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

export const fetchApiClient = (baseUrl: string, fetchImpl: typeof fetch): ApiClient => {
  const get = async <T>(path: string, resource: string): Promise<T> => {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`);
    } catch (error) {
      throw new ApiUnreachable(error instanceof Error ? error.message : String(error));
    }
    if (response.status === HTTP_NOT_FOUND) throw new NotFound(resource);
    if (response.status === HTTP_BAD_REQUEST) throw new InvalidRequest(await response.text());
    if (!response.ok) throw new ApiUnreachable(`HTTP ${String(response.status)}`);
    return (await response.json()) as T;
  };

  return {
    listProjects: () => get('/projects', 'Projects'),
    getSnapshotReport: (snapshotId) =>
      get(`/snapshots/${encodeURIComponent(snapshotId)}`, 'Snapshot'),
  };
};
