import { expect, it } from 'vitest';
import PrivacyPage from '../src/pages/confidentialite.astro';
import { CONTACT_EMAIL } from '../src/lib/contact';
import { get, renderPage } from './account-page-helpers';
import { fakeApiClient } from './fake-api-client';

const html = async () =>
  (await renderPage(PrivacyPage, get('/confidentialite'), fakeApiClient({}))).text();

it('lists the data collected for an account', async () => {
  const page = await html();

  expect(page).toContain('adresse e-mail');
  expect(page).toContain('empreinte du mot de passe');
  expect(page).toContain('sessions');
  expect(page).toContain('URL auditées');
  expect(page).toMatch(/adresse IP[^<]*mémoire[^<]*pas conservée/);
});

it('states the retention periods', async () => {
  const page = await html();

  expect(page).toContain('30 jours');
  expect(page).toMatch(/non vérifié[^<]*7 jours/);
  expect(page).toMatch(/supprimées[^<]*suppression du compte/);
});

it('names Brevo as the e-mail processor and gives the contact address', async () => {
  const page = await html();

  expect(page).toContain('Brevo');
  expect(CONTACT_EMAIL).toBe('contact@zero-strategie.dev');
  expect(page).toContain(`href="mailto:${CONTACT_EMAIL}"`);
});
