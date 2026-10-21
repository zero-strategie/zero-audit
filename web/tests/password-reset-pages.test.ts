import { expect, it } from 'vitest';
import { InvalidRequest } from '../src/lib/api/errors';
import ForgotPage from '../src/pages/mot-de-passe-oublie.astro';
import ResetPage from '../src/pages/reinitialiser.astro';
import { get, post, renderPage } from './account-page-helpers';
import { fakeApiClient } from './fake-api-client';

const GENERIC = 'Si cette adresse peut être utilisée, un e-mail vient de vous être envoyé';

it('asks for the e-mail address and shows the generic answer once submitted', async () => {
  const sent: string[] = [];
  const apiClient = fakeApiClient({
    requestPasswordReset: (email) => {
      sent.push(email);
      return Promise.resolve(GENERIC);
    },
  });

  const form = await (await renderPage(ForgotPage, get('/mot-de-passe-oublie'), apiClient)).text();
  const answer = await (
    await renderPage(
      ForgotPage,
      post('/mot-de-passe-oublie', { email: 'ada@example.test' }),
      apiClient,
    )
  ).text();

  expect(form).toMatch(/<input[^>]+type="email"[^>]+name="email"/);
  expect(sent).toEqual(['ada@example.test']);
  expect(answer).toContain('un e-mail vient de vous être envoyé');
});

it('puts the token of the link in the new-password form', async () => {
  const html = await (
    await renderPage(ResetPage, get('/reinitialiser?token=abc'), fakeApiClient({}))
  ).text();

  expect(html).toMatch(/<form[^>]+method="post"[^>]+action="\/reinitialiser"/);
  expect(html).toMatch(/<input[^>]+type="hidden"[^>]+name="token"[^>]+value="abc"/);
  expect(html).toMatch(/<input[^>]+type="password"[^>]+name="password"/);
});

it('confirms the new password with the API and redirects to the sign-in page', async () => {
  const calls: unknown[] = [];
  const apiClient = fakeApiClient({
    confirmPasswordReset: (input) => {
      calls.push(input);
      return Promise.resolve();
    },
  });

  const response = await renderPage(
    ResetPage,
    post('/reinitialiser', { token: 'abc', password: 'a brand new password' }),
    apiClient,
  );

  expect(calls).toEqual([{ token: 'abc', password: 'a brand new password' }]);
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/connexion?reinitialise=1');
});

it('shows the API error when the link or the password is refused', async () => {
  const apiClient = fakeApiClient({
    confirmPasswordReset: () => Promise.reject(new InvalidRequest('Ce lien est invalide ou a expiré')),
  });

  const response = await renderPage(
    ResetPage,
    post('/reinitialiser', { token: 'abc', password: 'x' }),
    apiClient,
  );

  expect(response.status).toBe(200);
  expect(await response.text()).toContain('Ce lien est invalide ou a expiré');
});
