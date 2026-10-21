import { expect, it } from 'vitest';
import { Forbidden, TooManyRequests, Unauthenticated } from '../src/lib/api/errors';
import LoginPage from '../src/pages/connexion.astro';
import { get, post, renderPage, setCookiesOf } from './account-page-helpers';
import { fakeApiClient } from './fake-api-client';

const CREDENTIALS = { email: 'ada@example.test', password: 'a long enough password' };
const loggingIn = fakeApiClient({ login: () => Promise.resolve('sess-1') });

it('shows the sign-in form and links to sign-up and to the password reset', async () => {
  const html = await (await renderPage(LoginPage, get('/connexion'), fakeApiClient({}))).text();

  expect(html).toMatch(/<form[^>]+method="post"[^>]+action="\/connexion"/);
  expect(html).toMatch(/<input[^>]+type="password"[^>]+name="password"/);
  expect(html).toContain('href="/inscription"');
  expect(html).toContain('href="/mot-de-passe-oublie"');
});

it('opens the session with a hardened cookie and redirects home with 303', async () => {
  const response = await renderPage(LoginPage, post('/connexion', CREDENTIALS), loggingIn);

  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/');
  const cookie = setCookiesOf(response).join('; ');
  expect(cookie).toContain('za_session=sess-1');
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('Secure');
  expect(cookie).toContain('SameSite=Lax');
  expect(cookie).toContain('Path=/');
  expect(cookie).toContain('Max-Age=2592000');
});

it('redirects to the return path when it is a path of the site', async () => {
  const response = await renderPage(
    LoginPage,
    post('/connexion', { ...CREDENTIALS, retour: '/compte' }),
    loggingIn,
  );

  expect(response.headers.get('location')).toBe('/compte');
});

it.each(['//evil.example', 'https://evil.example'])(
  'ignores the foreign return path %s',
  async (retour) => {
    const response = await renderPage(
      LoginPage,
      post('/connexion', { ...CREDENTIALS, retour }),
      loggingIn,
    );

    expect(response.headers.get('location')).toBe('/');
  },
);

it('keeps the return path in the form', async () => {
  const html = await (
    await renderPage(LoginPage, get('/connexion?retour=/compte'), fakeApiClient({}))
  ).text();

  expect(html).toMatch(/<input[^>]+type="hidden"[^>]+name="retour"[^>]+value="\/compte"/);
});

it('asks to confirm the address first, with a way to resend the link', async () => {
  const apiClient = fakeApiClient({
    login: () => Promise.reject(new Forbidden("Confirmez d'abord votre adresse e-mail")),
  });

  const html = await (
    await renderPage(LoginPage, post('/connexion', CREDENTIALS), apiClient)
  ).text();

  expect(html).toContain('Confirmez d&#39;abord votre adresse e-mail');
  expect(html).toContain('Renvoyer le lien de confirmation');
  expect(html).toMatch(/<input[^>]+type="hidden"[^>]+name="intent"[^>]+value="resend"/);
});

it('resends the confirmation link and shows the generic answer', async () => {
  const sent: string[] = [];
  const apiClient = fakeApiClient({
    resendVerification: (email) => {
      sent.push(email);
      return Promise.resolve('Si cette adresse peut être utilisée, un e-mail vient de vous être envoyé');
    },
  });

  const html = await (
    await renderPage(
      LoginPage,
      post('/connexion', { email: CREDENTIALS.email, intent: 'resend' }),
      apiClient,
    )
  ).text();

  expect(sent).toEqual([CREDENTIALS.email]);
  expect(html).toContain('un e-mail vient de vous être envoyé');
});

it.each([
  new Unauthenticated('E-mail ou mot de passe incorrect'),
  new TooManyRequests('Trop de tentatives, réessayez dans quelques minutes'),
])('shows the API refusal (%s) without opening a session', async (error) => {
  const apiClient = fakeApiClient({ login: () => Promise.reject(error) });

  const response = await renderPage(LoginPage, post('/connexion', CREDENTIALS), apiClient);

  expect(response.status).toBe(200);
  expect(setCookiesOf(response)).toEqual([]);
  expect(await response.text()).toContain(error.message);
});

it('confirms a password change announced by the reset page', async () => {
  const html = await (
    await renderPage(LoginPage, get('/connexion?reinitialise=1'), fakeApiClient({}))
  ).text();

  expect(html).toContain('Votre mot de passe a été modifié');
});
