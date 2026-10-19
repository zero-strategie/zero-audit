import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, it } from 'vitest';
import OpenSnapshotPage from '../src/pages/snapshots/index.astro';

const render = async (query: string) => {
  const container = await AstroContainer.create();
  return container.renderToResponse(OpenSnapshotPage, {
    request: new Request(`http://localhost/snapshots${query}`),
  });
};

it('redirects to the overview of the chosen audit', async () => {
  const response = await render('?id=abc%2Fd');

  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toBe('/snapshots/abc%2Fd');
});

it('redirects to the project list when no audit is given', async () => {
  const response = await render('');

  expect(response.headers.get('location')).toBe('/');
});
