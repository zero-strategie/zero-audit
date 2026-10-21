import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import type { ApiClient } from '../src/lib/api/api-client';
import type { CurrentAccount } from '../src/lib/api/types';

export const renderPage = async (
  page: AstroComponentFactory,
  request: Request,
  apiClient: ApiClient,
  user: CurrentAccount | null = null,
): Promise<Response> => {
  const container = await AstroContainer.create();
  return container.renderToResponse(page, { request, locals: { apiClient, user } });
};

export const post = (
  path: string,
  fields: Record<string, string>,
  headers: Record<string, string> = {},
): Request =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { origin: 'http://localhost', host: 'localhost', ...headers },
    body: new URLSearchParams(fields),
  });

export const get = (path: string): Request => new Request(`http://localhost${path}`);

interface CookieJar {
  consume(): Iterable<string>;
}

/** The container leaves cookies on the response object instead of in its headers. */
export const setCookiesOf = (response: Response): string[] => {
  const jar = Reflect.get(response, Symbol.for('astro.cookies')) as CookieJar | undefined;
  return jar ? [...jar.consume()] : [];
};
