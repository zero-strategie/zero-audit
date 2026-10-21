# S48 – Inscription, vérification d'e-mail et connexion dans l'API

## Résumé
Routes `POST /auth/register`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/login`, `/auth/logout` et `GET /auth/me`, avec leurs use-cases (`src/application/auth/`), le port `TokenGenerator`, le branchement dans `serve` et `ZERO_AUDIT_ADMIN_EMAILS`. Lint, typecheck et tests verts (946 tests racine + 273 web, aucun sauté, Postgres inclus). Aucune dépendance ajoutée.

Demande de l'utilisateur « remove the basic auth » : le basic auth est celui de Caddy, dans `zero-infra`. Il reste volontairement en place (décisions 9 et A13 du feedback : aucun changement zero-infra pendant la mission, et l'API n'applique pas encore les sessions avant S50). Rien à retirer dans ce dépôt pour cette story ; le retrait se fait dans la PR zero-infra après la mission.

## Changements
- Domaine : erreurs `Unauthenticated` (raison `bad-credentials` ou `no-session`), `EmailNotVerified`, `InvalidOrExpiredToken`.
- Ports : `TokenGenerator` (adapter `RandomTokenGenerator`, 32 octets en base64url) ; `Mailer.enabled` ; `UserRepository.updatePasswordHash` (3 adapters + contrat).
- Use-cases : `RegisterAccount`, `ResendVerification`, `SendVerificationLink` (plafond de 3 liens par heure compté en base), `VerifyEmail`, `Login`, `OpenSession`, `ResolveSession`, `Logout`, `GetCurrentAccount`.
- HTTP : `src/http/routes/auth.ts`, `src/http/errors.ts` (nouveaux codes `unauthenticated`, `forbidden`, `unavailable`, messages français), `ServerDependencies` étendu.
- CLI : `Storage` expose `users`, `sessions`, `emailTokens` ; `serve` compose hasher scrypt, mailer, générateur et horloge ; `ZERO_AUDIT_ADMIN_EMAILS` dans `config.ts` et `.env.example`.

## Correspondance critères → tests
| critère | fichier:ligne du test |
|---|---|
| Inscription : 202 générique, compte non vérifié, jeton haché 24 h, lien avec jeton brut | tests/http/auth-register.test.ts:14 ; tests/application/auth/register-account.test.ts:18 |
| Adresse vérifiée : même réponse, aucun e-mail | tests/http/auth-register.test.ts:27 |
| Non vérifiée : mot de passe remplacé, nouveau lien, plafond 3 par heure | tests/http/auth-register.test.ts:38 ; tests/application/auth/register-account.test.ts (« at most 3 links per hour ») |
| E-mail invalide / mot de passe de 11 caractères : 400 en français | tests/http/auth-register.test.ts:55 et :67 |
| Champ piège : 202 générique, rien créé ni envoyé | tests/http/auth-register.test.ts:82 |
| Mailer désactivé : 503 (inscription et renvoi) | tests/http/auth-register.test.ts:93 et :127 |
| Jeton valide : compte vérifié, jeton consommé, session ; rejeu en 400 | tests/http/auth-session.test.ts:26 |
| Jeton expiré ou inconnu : même 400 | tests/http/auth-session.test.ts:45 |
| Non vérifié : 403 avec le bon mot de passe, 401 avec un mauvais | tests/http/auth-session.test.ts:60 |
| Adresse inconnue : 401 et `verifyDummy` appelé | tests/http/auth-session.test.ts:75 |
| Deux connexions : deux sessions de 30 jours, hash seul stocké | tests/http/auth-session.test.ts:85 |
| Déconnexion : 204, seule la session donnée est supprimée | tests/http/auth-session.test.ts:102 |
| `/auth/me` : 401 sans session, expirée ou inconnue ; e-mail et `isAdmin` sans tenir compte de la casse | tests/http/auth-session.test.ts:115, :127, :136 ; tests/cli/config.test.ts (« administrator addresses ») |
| Renvoi : 202 identique, e-mail seulement pour une adresse non vérifiée | tests/http/auth-register.test.ts:110 |
| Suite complète sans test sauté, lint, typecheck | `TEST_DATABASE_URL=… pnpm test`, `pnpm lint`, `pnpm typecheck` |

## Points d'attention pour la relecture
- **Mailer désactivé testé avant tout** : le 503 vient de `Mailer.enabled`, pas de l'échec d'envoi. Sinon une adresse déjà vérifiée (aucun envoi) répondrait 202 et une adresse neuve 503, ce qui révélerait l'existence du compte. Le mot de passe est aussi haché pour toute adresse valide, pour égaliser les temps de réponse.
- `POST /auth/logout` répond 401 sans session valide (au lieu d'un 204 muet).
- Le message 401 dépend de la raison : « E-mail ou mot de passe incorrect » (connexion) ou « Connexion requise » (session absente ou expirée).
- Une adresse mal formée à la connexion ou au renvoi est traitée comme inconnue (même réponse, `verifyDummy` appelé à la connexion).
- Le plafond de 3 liens est inclusif : un jeton créé il y a exactement une heure compte encore.
- `publicUrl` vaut `ZERO_AUDIT_PUBLIC_URL`, ou `http://127.0.0.1:4321` pour les mailers `console` et désactivé sans URL.
- `MailDeliveryFailed` (échec Brevo) n'est pas mappé : il devient une 500 générique.
- Limites par IP et par compte : S49. Fastify reste sans logger.

## Hors périmètre remarqué
- `docs/user-guide.md` (ligne 227) décrit toujours le `basic_auth` de Caddy : à mettre à jour avec la documentation (S53) et la PR zero-infra.
