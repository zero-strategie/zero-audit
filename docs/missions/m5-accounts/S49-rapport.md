# S49 – Mot de passe oublié, suppression de compte et anti-abus

## Résumé
Ajout de `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm` et `DELETE /auth/me`, du port `RateLimiter` (adapter mémoire fondé sur `Clock`) et des limites de connexion (5 échecs par compte, 20 par IP, 15 min) et d'inscription (5 par IP et par heure). Branche `feat/accounts`, sha de départ `8687f4d`. Lint, typecheck et la suite complète (Postgres inclus, `TEST_DATABASE_URL` défini) sont verts : 981 + 273 tests, aucun sauté.

## Changements
- Domaine : `src/domain/abuse-limits.ts` (constantes), erreurs `TooManyAttempts` et `AuditInProgress`.
- Port `src/application/ports/rate-limiter.ts` (`hit(key, windowMs)`, `isBlocked(key, limit, windowMs)`) et adapter `src/infrastructure/rate-limit/in-memory-rate-limiter.ts` (purge des clés expirées à chaque `hit`).
- Use-cases : `RequestPasswordReset`, `ConfirmPasswordReset`, `DeleteAccount` ; `Login` et `RegisterAccount` reçoivent `rateLimiter` et `ip`. La limite par IP et par compte est vérifiée avant tout hachage.
- HTTP : routes dans `src/http/routes/auth.ts`, helper `src/http/client-ip.ts` (X-Real-IP, sinon `request.ip`, Fastify sans `trustProxy`), 429 `too_many_attempts` (code distinct de `quota_exceeded`), 409 « Un audit est en cours, réessayez à la fin ».
- Composition : `Storage.eraser` (SQLite et Postgres, déjà existants) et `InMemoryRateLimiter` passés à `buildServer` par `serve`.
- `MAX_LINKS_PER_HOUR` remplacé par `EMAIL_LINKS_PER_HOUR` (domaine), partagé par vérification et réinitialisation.

## Correspondance critères → tests
| critère | fichier:ligne du test |
|---|---|
| Reset : 202 générique, e-mail valable 1 h, adresse inconnue identique | tests/http/auth-recovery.test.ts:32 ; tests/application/auth/request-password-reset.test.ts:21 |
| Plus de 3 liens par heure : 202 sans e-mail | tests/http/auth-recovery.test.ts:49 ; tests/application/auth/request-password-reset.test.ts:48 |
| Confirm : mot de passe changé, sessions supprimées, jeton consommé, ancien refusé | tests/http/auth-recovery.test.ts:73 ; tests/application/auth/confirm-password-reset.test.ts:30 |
| Jeton expiré / utilisé / de type verify : 400 | tests/http/auth-recovery.test.ts:101 ; tests/application/auth/confirm-password-reset.test.ts:49 |
| Mot de passe de 11 caractères : 400, jeton non consommé | tests/http/auth-recovery.test.ts:123 ; tests/application/auth/confirm-password-reset.test.ts:65 |
| Mailer désactivé : 503 | tests/http/auth-recovery.test.ts:62 |
| DELETE /auth/me : mauvais mot de passe ou sans session, 401 | tests/http/auth-delete-account.test.ts:36 |
| DELETE /auth/me : 204, effacement, vitrine et autre compte intacts | tests/http/auth-delete-account.test.ts:51 |
| Audit en cours : 409 | tests/http/auth-delete-account.test.ts:68 ; tests/application/auth/delete-account.test.ts (cas « running ») |
| 5 échecs par compte : 429 puis OK après 15 min | tests/http/auth-abuse.test.ts:16 ; tests/application/auth/login.test.ts (anti-abuse) |
| 20 échecs par IP : 429 sans scrypt (ni `verify` ni `verifyDummy`, compte existant visé), autre IP libre | tests/http/auth-abuse.test.ts:32 ; tests/application/auth/login.test.ts:102 |
| 6e inscription par IP : 429, aucun compte | tests/http/auth-abuse.test.ts:68 ; tests/application/auth/register-account.test.ts:135 |
| Sans X-Real-IP : `request.ip` | tests/http/auth-abuse.test.ts:52 ; tests/http/client-ip.test.ts |
| Suite complète sans test sauté, lint, typecheck | exécutés : verts |

## Points d'attention pour la relecture
- Signature du port : `hit(key, windowMs)` et `isBlocked(key, limit, windowMs)` (la limite n'est portée que par `isBlocked`), plutôt que `hit(key, limit, window)` des notes.
- 409 pendant un audit (A15) : `DeleteAccount` consulte les snapshots `running` (hors orphelins de plus de 6 h) des projets du compte, sans modifier `AuditRunner`. Le runner n'a pas encore de notion de propriétaire (S51) ; la fenêtre entre la prise du verrou et la création du snapshot n'est pas couverte. `AuditInProgress` est une erreur distincte d'`AuditAlreadyRunning`, dont le message est différent.
- Un échec de connexion est compté pour une adresse inconnue comme pour une adresse connue (pas d'énumération). Un compte non vérifié avec le bon mot de passe n'est pas un échec.
- Seul un compte vérifié reçoit un lien de réinitialisation.
- Écarts TDD : les tests des use-cases `RequestPasswordReset`, `Login`/`Register` anti-abus (rouges constatés), mais `RequestPasswordReset`, les tests HTTP de `DELETE /auth/me`, d'abus et `client-ip` ont été écrits avec ou après le code (les tests sont verts d'emblée).
- Tant que le web (S52) ne relaie pas `X-Real-IP`, toutes les connexions venant du web partagent l'IP de sa connexion et donc le plafond de 20 échecs : à traiter en S52 (A19).
- Aucune dépendance ajoutée.

## Retours du reviewer (verdict S49)
- Bloquant traité : `FakePasswordHasher` compte désormais `verifyCalls` et expose `verifications` (verify + verifyDummy). Les deux tests « 21e tentative » visent un compte existant et vérifient que ce total ne bouge pas. Contrôle de mutation fait : en déplaçant les `isBlocked` après le hachage dans `login.ts`, les deux tests échouent ; le code a été restauré.
- Non traité, hors correctif demandé : limite sur la vérification du mot de passe de `DELETE /auth/me` (suggestion, à décider ; clé `login-account:<email>` proposée).
- Non traité : canal auxiliaire de temps de réponse (envoi du lien attendu seulement pour un compte vérifié, aussi à l'inscription) : à noter pour S53 (docs).
- Non traité : 409 fondé sur l'état d'`AuditRunner` : à faire avec S51.

## Hors périmètre remarqué
- Le web n'appelle pas encore les nouvelles routes (S52).
- Les sessions ne sont pas supprimées à la suppression de compte par le contrôle de l'API seul : c'est fait par `AccountEraser.eraseAccount` (S46).
