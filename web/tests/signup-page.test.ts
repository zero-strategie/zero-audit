import { expect, it } from 'vitest';
import { InvalidRequest, ServiceUnavailable, TooManyRequests } from '../src/lib/api/errors';
import SignupPage from '../src/pages/inscription.astro';
import { get, post, renderPage } from './account-page-helpers';
import { fakeApiClient } from './fake-api-client';

const FIELDS = { email: 'ada@example.test', password: 'a long enough password', website: '' };

it('shows an e-mail field, a password field and the honeypot', async () => {
  const html = await (await renderPage(SignupPage, get('/inscription'), fakeApiClient({}))).text();

  expect(html).toMatch(/<form[^>]+method="post"[^>]+action="\/inscription"/);
  expect(html).toMatch(/<input[^>]+type="email"[^>]+name="email"/);
  expect(html).toMatch(/<input[^>]+type="password"[^>]+name="password"/);
});

it('hides the honeypot off screen, not with display:none, and tells humans to leave it empty', async () => {
  const html = await (await renderPage(SignupPage, get('/inscription'), fakeApiClient({}))).text();

  const field = /<input[^>]+name="website"[^>]*>/.exec(html)?.[0] ?? '';
  expect(field).toContain('autocomplete="off"');
  expect(field).toContain('tabindex="-1"');
  expect(html).toMatch(/class="[^"]*visually-hidden[^"]*"/);
  expect(html).not.toContain('display:none');
  expect(html).toContain('Laissez ce champ vide');
});

it('relays the form to the API and shows its generic message', async () => {
  const calls: unknown[] = [];
  const apiClient = fakeApiClient({
    register: (input) => {
      calls.push(input);
      return Promise.resolve(
        'Si cette adresse peut être utilisée, un e-mail vient de vous être envoyé',
      );
    },
  });

  const html = await (await renderPage(SignupPage, post('/inscription', FIELDS), apiClient)).text();

  expect(calls).toEqual([FIELDS]);
  expect(html).toContain('un e-mail vient de vous être envoyé');
});

it('says sign-ups are unavailable when the API answers 503', async () => {
  const apiClient = fakeApiClient({ register: () => Promise.reject(new ServiceUnavailable('x')) });

  const response = await renderPage(SignupPage, post('/inscription', FIELDS), apiClient);

  expect(await response.text()).toContain('Les inscriptions sont momentanément indisponibles');
});

it.each([
  new InvalidRequest('Adresse e-mail invalide'),
  new TooManyRequests('Trop de tentatives, réessayez dans quelques minutes'),
])('shows the API message of a refusal (%s)', async (error) => {
  const apiClient = fakeApiClient({ register: () => Promise.reject(error) });

  const response = await renderPage(SignupPage, post('/inscription', FIELDS), apiClient);

  expect(await response.text()).toContain(error.message);
});
