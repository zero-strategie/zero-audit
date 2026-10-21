import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, it } from 'vitest';
import NewAuditPage from '../src/pages/audits/new.astro';
import { Conflict, InvalidRequest, TooManyRequests, Unauthenticated } from '../src/lib/api/errors';
import type { ApiClient } from '../src/lib/api/api-client';
import type { CurrentAccount } from '../src/lib/api/types';
import { anAccount, aStartedAudit, fakeApiClient } from './fake-api-client';

const render = async (
  apiClient: ApiClient,
  request: Request,
  user: CurrentAccount | null = anAccount({ isAdmin: true, pagesLimitMax: 500 }),
) => {
  const container = await AstroContainer.create();
  return container.renderToResponse(NewAuditPage, { request, locals: { apiClient, user } });
};

const submit = (fields: Record<string, string>, headers: Record<string, string> = {}) =>
  new Request('http://localhost/audits/new', {
    method: 'POST',
    headers: { origin: 'http://localhost', host: 'localhost', ...headers },
    body: new URLSearchParams(fields),
  });

const startAudit =
  (calls: { url: string; limit: number }[]): ApiClient['startAudit'] =>
  (input) => {
    calls.push(input);
    return Promise.resolve(aStartedAudit({ snapshotId: 's7' }));
  };

it('shows a URL field, the page limits with 100 selected and the launch button', async () => {
  const html = await (
    await render(fakeApiClient({}), new Request('http://localhost/audits/new'))
  ).text();

  expect(html).toMatch(/<form[^>]+method="post"[^>]+action="\/audits\/new"/);
  expect(html).toMatch(/<input[^>]+type="url"[^>]+required|<input[^>]+required[^>]+type="url"/);
  expect(html).toContain('Pages maximum');
  expect(html).toMatch(/<option value="50"[^>]*>/);
  expect(html).toMatch(/<option value="100" selected[^>]*>/);
  expect(html).toMatch(/<option value="250"[^>]*>/);
  expect(html).toMatch(/<option value="500"[^>]*>/);
  expect(html).toContain("Lancer l'audit");
});

it('starts the audit and redirects with 303 to its tracking page', async () => {
  const calls: { url: string; limit: number }[] = [];
  const response = await render(
    fakeApiClient({ startAudit: startAudit(calls) }),
    submit({ url: 'https://alpha.test/', limit: '250' }),
  );

  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/audits/s7');
  expect(calls).toEqual([{ url: 'https://alpha.test/', limit: 250 }]);
});

it.each([
  ['400', new InvalidRequest('Site introuvable : le nom de domaine ne résout pas')],
  ['409', new Conflict('Un audit est déjà en cours depuis 2026-03-05T09:00:00.000Z')],
])('redisplays the form with the message, the URL and the limit on a %s', async (_, error) => {
  const response = await render(
    fakeApiClient({ startAudit: () => Promise.reject(error) }),
    submit({ url: 'https://alpha.test/', limit: '250' }),
  );
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(html).toMatch(/class="alert alert-error"[^>]*>[^<]*/);
  expect(html).toContain(error.message);
  expect(html).toContain('value="https://alpha.test/"');
  expect(html).toMatch(/<option value="250" selected/);
  expect(html).not.toMatch(/<option value="100" selected/);
});

it.each([
  ['a different origin', { origin: 'https://evil.test' }],
  ['no origin', { origin: '' }],
])('answers 403 without calling the API for %s', async (_, headers) => {
  const calls: { url: string; limit: number }[] = [];
  const request = submit({ url: 'https://alpha.test/', limit: '100' }, headers);
  if (!headers.origin) request.headers.delete('origin');
  const response = await render(fakeApiClient({ startAudit: startAudit(calls) }), request);

  expect(response.status).toBe(403);
  expect(calls).toEqual([]);
});

it('sends an anonymous visitor to the sign-in page, then back to the launch form', async () => {
  const response = await render(fakeApiClient({}), new Request('http://localhost/audits/new'), null);

  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/connexion?retour=/audits/new');
});

it('redirects an anonymous relaunch to the sign-in page without calling the API', async () => {
  const response = await render(
    fakeApiClient({}),
    submit({ url: 'https://alpha.test/', limit: '100' }),
    null,
  );

  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/connexion?retour=/audits/new');
});

it('offers only 50 and 100 pages to a free account', async () => {
  const html = await (
    await render(fakeApiClient({}), new Request('http://localhost/audits/new'), anAccount())
  ).text();

  expect(html).toMatch(/<option value="50"/);
  expect(html).toMatch(/<option value="100" selected/);
  expect(html).not.toMatch(/<option value="250"/);
  expect(html).not.toMatch(/<option value="500"/);
});

it('shows the quota message of the API and keeps the typed fields on a 429', async () => {
  const message = 'Limite de 3 audits par 24 h atteinte : prochain audit possible le 06/03/2026 à 10:00';
  const html = await (
    await render(
      fakeApiClient({ startAudit: () => Promise.reject(new TooManyRequests(message)) }),
      submit({ url: 'https://alpha.test/', limit: '50' }),
      anAccount(),
    )
  ).text();

  expect(html).toContain(message);
  expect(html).toContain('value="https://alpha.test/"');
  expect(html).toMatch(/<option value="50" selected/);
});

it('redirects to the sign-in page when the session expired during the launch', async () => {
  const response = await render(
    fakeApiClient({ startAudit: () => Promise.reject(new Unauthenticated('Session expirée')) }),
    submit({ url: 'https://alpha.test/', limit: '100' }),
  );

  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/connexion?retour=/audits/new');
});
