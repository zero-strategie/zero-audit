# Rapport S64 – Retirer l'API HTTP, la commande serve et leur configuration

## Résumé
`src/http/`, `tests/http/`, `fastify`, la commande `serve`, `daily-purge`, `mailer-factory` (CLI) et la configuration associée (e-mails, Brevo, admins, quotas, worker embarqué, HOST/PORT) sont retirés. `zero-audit serve` sort en 2 avec l'aide, qui ne cite plus `serve`. Lint, typecheck et tests (1030, aucun skip, Postgres inclus) sont verts.

## Changements
- `src/cli/config.ts` : retrait de `ServeConfig`, `MailConfig`, `MAILER_KINDS`, `DEFAULT_MAIL_FROM`, `DEFAULT_HOST`, `DEFAULT_PORT`, `DEFAULT_LAUNCHES_PER_DAY`, `DEFAULT_QUEUE_MAX`, `WorkerMode` et des parseurs associés. `serve` retombe sur la branche « audit » : `serve` n'est pas une URL, d'où l'erreur d'usage.
- `src/cli/run-cli.ts` : retrait de la commande, des hooks `onServerStarted`, `createServer`, `untilStopped`, `onWorkerStarted`. `EmbeddedWorker` devient `WorkerLoop` (utilisé par `worker`).
- `src/cli/interrupt-controller.ts` : retrait de `ClosableServer` et de la fermeture du serveur ; `terminate` sort en 143 sauf pour le processus `worker`.
- `src/cli/main.ts` : shebang conservé, plus de crochets serveur ni worker embarqué.
- `src/cli/usage.ts`, `.env.example`, commentaires de `audit-factory.ts`.
- Tests : suppression des tests HTTP, serve, daily-purge, mailer-factory ; adaptation de config, interrupt-controller, project-files ; `run-cli-new-checks` lit désormais les issues via `ListIssues` au lieu de l'API ; ajout du cas `serve` → code 2 dans `run-cli.test.ts`. Suppression de `tests/support/audit-doubles.ts` et de `idleAccountDependencies` (devenus inutilisés).

## Correspondance critères → tests
| critère | test |
|---|---|
| fichiers retirés, fastify absent | vérification `git ls-files` / `package.json` (pas de test) |
| `serve` sort en 2, aide sans `serve` | tests/cli/run-cli.test.ts:222 (cas `[['serve']]`), tests/cli/config.test.ts:201-207 |
| `parseCommand(['serve'])` erreur d'usage | tests/cli/config.test.ts:198 |
| SIGINT 130 / SIGTERM 143 | tests/cli/interrupt-controller.test.ts (tests existants du contrôleur) |
| shebang, plus de `onServerStarted` | lecture de `src/cli/main.ts` |
| `.env.example` sans variables API/mail/admin/quota | tests/cli/project-files.test.ts:39 |
| suite complète | `TEST_DATABASE_URL=… pnpm test` : 100 fichiers, 1030 tests, 0 skip |

## Points d'attention pour la relecture
- **Écart de spec sur le worker** : le critère dit « SIGTERM → 143 » pour le worker, mais le comportement existant (et ses tests, à garder inchangés) fait sortir le processus `worker` en 0 sur SIGINT et SIGTERM (l'audit en cours est remis en file). 130/143 restent ceux de l'audit direct. Comportement conservé tel quel, aucune régression (R11).
- **`git grep` du critère 6 non vide** : il reste des faux positifs hors périmètre : `createServer` de `node:http` dans `tests/support/fixture-server.ts` et `tests/infrastructure/mail/brevo-mailer.test.ts`, `BREVO_API_URL` dans `src/infrastructure/mail/brevo-mailer.ts` (adapter e-mail, pas retiré par S64), et la chaîne `'BREVO'` du test de `.env.example`. Aucune occurrence liée à Fastify, `onServerStarted`, `ClosableServer`, `DEFAULT_PUBLIC_URL` ni `startDailyPurge`.
- `InterruptController.onWorkerStarted` est conservé (ses tests existants sont à garder inchangés) mais plus appelé par `main.ts`.
- `pnpm-lock.yaml` régénéré (`--lockfile-only`) pour retirer fastify.

## Hors périmètre remarqué
- README, `docs/user-guide.md` et `docs/developer-guide.md` décrivent encore `serve`, l'API et HOST/PORT : à réécrire dans la story de documentation.
- Adapter Brevo, cas d'usage de comptes/auth, `PurgeStaleAccounts`, `LaunchAudit` : code mort désormais, à traiter par S65 et suivantes.
