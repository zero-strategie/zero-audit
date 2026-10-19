import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, it } from 'vitest';
import IndexPage from '../src/pages/index.astro';

it('renders the home page with its title', async () => {
  const container = await AstroContainer.create();

  const html = await container.renderToString(IndexPage);

  expect(html).toContain('<title>zero-audit</title>');
  expect(html).toMatch(/<h1[^>]*>zero-audit<\/h1>/);
});
