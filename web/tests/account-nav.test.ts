import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, it } from 'vitest';
import MainNav from '../src/components/MainNav.astro';
import type { CurrentAccount } from '../src/lib/api/types';
import { anAccount } from './fake-api-client';

const render = async (user: CurrentAccount | null) => {
  const container = await AstroContainer.create();
  return container.renderToString(MainNav, { props: { user } });
};

it('offers the account page and a logout button to a signed-in user', async () => {
  const html = await render(anAccount());

  expect(html).toMatch(/<a href="\/compte"[^>]*>\s*Mon compte\s*<\/a>/);
  expect(html).toMatch(/<form[^>]+method="post"[^>]+action="\/deconnexion"/);
  expect(html).toContain('Se déconnecter');
  expect(html).not.toContain('Se connecter');
});

it('offers sign-in and sign-up to a visitor', async () => {
  const html = await render(null);

  expect(html).toMatch(/<a href="\/connexion"[^>]*>\s*Se connecter\s*<\/a>/);
  expect(html).toMatch(/<a href="\/inscription"[^>]*>\s*S'inscrire\s*<\/a>/);
  expect(html).not.toContain('Mon compte');
});
