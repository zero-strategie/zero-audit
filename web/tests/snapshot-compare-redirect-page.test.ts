import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import CompareRedirectPage from '../src/pages/snapshots/[id]/compare.astro';
import { NotFound } from '../src/lib/api/errors';
import { aReport, fakeApiClient } from './fake-api-client';

const render = async (apiClient: ReturnType<typeof fakeApiClient>, id: string) => {
  const container = await AstroContainer.create();
  return container.renderToResponse(CompareRedirectPage, {
    params: { id },
    request: new Request(`http://localhost/snapshots/${id}/compare`),
    locals: { apiClient },
  });
};

describe('snapshot comparison redirect', () => {
  it('redirects to the comparison of the project owning the snapshot', async () => {
    const report = aReport({ snapshot: { ...aReport().snapshot, projectId: 'p/1' } });
    const apiClient = fakeApiClient({ getSnapshotReport: () => Promise.resolve(report) });

    const response = await render(apiClient, 's1');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/projects/p%2F1/compare');
  });

  it('shows the not found view when the snapshot does not exist', async () => {
    const apiClient = fakeApiClient({
      getSnapshotReport: () => Promise.reject(new NotFound('snapshot')),
    });

    const response = await render(apiClient, 'missing');

    expect(response.status).toBe(404);
  });
});
