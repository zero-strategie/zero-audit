import { expect, it } from 'vitest';
import { Conflict, Unauthenticated } from '../src/lib/api/errors';
import AccountPage from '../src/pages/compte.astro';
import LogoutPage from '../src/pages/deconnexion.astro';
import { get, post, renderPage, setCookiesOf } from './account-page-helpers';
import { anAccount, fakeApiClient } from './fake-api-client';

it('sends an anonymous visitor to the sign-in page, then back to the account', async () => {
  const response = await renderPage(AccountPage, get('/compte'), fakeApiClient({}));

  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/connexion?retour=/compte');
});

it('shows the e-mail, the audits left and the time of the next possible audit', async () => {
  const html = await (
    await renderPage(
      AccountPage,
      get('/compte'),
      fakeApiClient({}),
      anAccount({ auditsRemaining: 0 }),
    )
  ).text();

  expect(html).toContain('ada@example.test');
  expect(html).toMatch(/Audits restants[\s\S]*?0/);
  expect(html).toContain('Prochain audit possible');
  expect(html).toContain('06/03/2026');
  expect(html).toContain('Se déconnecter');
});

it('shows unlimited audits to an administrator', async () => {
  const html = await (
    await renderPage(
      AccountPage,
      get('/compte'),
      fakeApiClient({}),
      anAccount({ isAdmin: true, auditsRemaining: null, nextAuditAt: null }),
    )
  ).text();

  expect(html).toContain('illimité');
  expect(html).not.toContain('Prochain audit possible');
});

it('offers to resend the confirmation link and to delete the account with the password', async () => {
  const html = await (
    await renderPage(AccountPage, get('/compte'), fakeApiClient({}), anAccount())
  ).text();

  expect(html).toContain('Renvoyer le lien de confirmation');
  expect(html).toMatch(/<form[^>]+method="post"[^>]+action="\/compte"/);
  expect(html).toMatch(/<input[^>]+type="password"[^>]+name="password"/);
  expect(html).toContain('Supprimer mon compte');
});

it('resends the link to the e-mail of the account', async () => {
  const sent: string[] = [];
  const apiClient = fakeApiClient({
    resendVerification: (email) => {
      sent.push(email);
      return Promise.resolve(
        'Si cette adresse peut être utilisée, un e-mail vient de vous être envoyé',
      );
    },
  });

  const html = await (
    await renderPage(AccountPage, post('/compte', { intent: 'resend' }), apiClient, anAccount())
  ).text();

  expect(sent).toEqual(['ada@example.test']);
  expect(html).toContain('un e-mail vient de vous être envoyé');
});

it('deletes the account, clears the cookie and goes home', async () => {
  const passwords: string[] = [];
  const apiClient = fakeApiClient({
    deleteAccount: (password) => {
      passwords.push(password);
      return Promise.resolve();
    },
  });

  const response = await renderPage(
    AccountPage,
    post('/compte', { intent: 'delete', password: 'secret value' }),
    apiClient,
    anAccount(),
  );

  expect(passwords).toEqual(['secret value']);
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/');
  expect(setCookiesOf(response).join(';')).toMatch(/za_session=deleted;.*Expires=Thu, 01 Jan 1970/);
});

it.each([
  new Unauthenticated('E-mail ou mot de passe incorrect'),
  new Conflict('Un audit est en cours, réessayez à la fin'),
])('shows the refusal (%s) and keeps the cookie', async (error) => {
  const apiClient = fakeApiClient({ deleteAccount: () => Promise.reject(error) });

  const response = await renderPage(
    AccountPage,
    post('/compte', { intent: 'delete', password: 'secret value' }),
    apiClient,
    anAccount(),
  );

  expect(await response.text()).toContain(error.message);
  expect(setCookiesOf(response)).toEqual([]);
});

it('logs out through the API, clears the cookie and goes home', async () => {
  let loggedOut = 0;
  const apiClient = fakeApiClient({
    logout: () => {
      loggedOut += 1;
      return Promise.resolve();
    },
  });

  const response = await renderPage(LogoutPage, post('/deconnexion', {}), apiClient, anAccount());

  expect(loggedOut).toBe(1);
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/');
  expect(setCookiesOf(response).join(';')).toMatch(/za_session=deleted;.*Expires=Thu, 01 Jan 1970/);
});

it('still clears the cookie when the API no longer knows the session', async () => {
  const apiClient = fakeApiClient({
    logout: () => Promise.reject(new Unauthenticated('Connexion requise')),
  });

  const response = await renderPage(LogoutPage, post('/deconnexion', {}), apiClient, anAccount());

  expect(response.status).toBe(303);
  expect(setCookiesOf(response).join(';')).toMatch(/za_session=deleted;.*Expires=Thu, 01 Jan 1970/);
});
