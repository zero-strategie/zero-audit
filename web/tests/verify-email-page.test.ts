import { expect, it } from 'vitest';
import { InvalidRequest } from '../src/lib/api/errors';
import VerifyPage from '../src/pages/verifier-email.astro';
import { get, post, renderPage, setCookiesOf } from './account-page-helpers';
import { fakeApiClient } from './fake-api-client';

it('shows an activation button without calling the API on a plain visit', async () => {
  const response = await renderPage(
    VerifyPage,
    get('/verifier-email?token=abc'),
    fakeApiClient({}),
  );
  const html = await response.text();

  expect(html).toMatch(/<form[^>]+method="post"[^>]+action="\/verifier-email"/);
  expect(html).toMatch(/<input[^>]+type="hidden"[^>]+name="token"[^>]+value="abc"/);
  expect(html).toContain('Activer mon compte');
});

it('activates the account, opens the session and redirects to the new audit page', async () => {
  const tokens: string[] = [];
  const apiClient = fakeApiClient({
    verifyEmail: (token) => {
      tokens.push(token);
      return Promise.resolve('sess-9');
    },
  });

  const response = await renderPage(
    VerifyPage,
    post('/verifier-email', { token: 'abc' }),
    apiClient,
  );

  expect(tokens).toEqual(['abc']);
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/audits/new');
  expect(setCookiesOf(response).join(';')).toContain('za_session=sess-9');
});

it('tells the visitor the link is invalid or expired when the API refuses it', async () => {
  const apiClient = fakeApiClient({
    verifyEmail: () => Promise.reject(new InvalidRequest('message de l’API')),
  });

  const response = await renderPage(
    VerifyPage,
    post('/verifier-email', { token: 'abc' }),
    apiClient,
  );

  expect(await response.text()).toContain('Ce lien est invalide ou a expiré');
  expect(setCookiesOf(response)).toEqual([]);
});
