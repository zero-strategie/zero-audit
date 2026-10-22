# S68 - Journaliser les lancements sans construire de repository de compte

## Résumé
Les repositories de snapshots (Postgres, SQLite, en mémoire) ne construisent ni n'importent plus aucun repository de compte. Le journal `api_launches` et l'admission sont inchangés (SQL direct déjà en place, `hashToken(email)` sur l'e-mail stocké, sans nouvelle normalisation : l'e-mail est lu tel que stocké, déjà normalisé à l'inscription).

## Changements
- `postgres-snapshot-repository.ts`, `sqlite-snapshot-repository.ts` : suppression de `users`, `sessions`, `emailTokens`, `eraser`. SQLite expose `db` (lecture seule) pour que le produit hébergé y branche ses repositories (préfigure S69).
- `in-memory-snapshot-repository.ts` : `Pick<UserRepository,'findById'>` remplacé par `emailOf?: (userId) => Promise<string | null>`.
- `src/cli/storage-factory.ts` : construit lui-même les repositories de comptes depuis la base ou le pool (provisoire jusqu'à S69).
- Tests : nouveau `tests/support/legacy-accounts.ts` (insertion SQL d'un utilisateur, SQLite, Postgres, mémoire) ; les contrats de snapshots et de file l'utilisent (`accounts` à la place de `users`). Les tests de comptes construisent leurs repositories depuis `db`/`pool`. Deux tests ajoutés (SQLite, Postgres) : la ligne `api_launches` porte le SHA-256 de l'e-mail d'un utilisateur inséré en SQL.
- Liste des tables tronquées inchangée (contient `users`, `sessions`, `email_tokens`, `api_launches`). Aucune migration touchée.

## Correspondance critères -> tests
| critère | fichier:ligne du test |
|---|---|
| Journal avec hash de l'e-mail (SQL direct) | tests/infrastructure/sqlite-snapshot-repository.test.ts (describe "launch journal"), tests/infrastructure/postgres-snapshot-repository.test.ts (describe "launch journal") |
| Atomicité si l'admission lève | tests/support/snapshot-repository-contract.ts ("writes nothing and propagates the error when the admission refuses"), exécuté en SQLite, Postgres, mémoire |
| countActiveFor / listLaunchedAtBy / countApiLaunchedSince inchangés | tests/support/snapshot-repository-contract.ts ("launch counts", "AuditQueue contract"), assertions inchangées |
| `launchedBy` null : pas de journal | tests/support/snapshot-repository-contract.ts ("does not journal a CLI launch") |
| Aucun import de repository de compte dans les 3 adapters | vérifié par grep (voir ci-dessous), pas de test dédié |
| Tables tronquées | `CONTENT_TABLES` dans tests/infrastructure/postgres-snapshot-repository.test.ts |
| Test S61 / suite complète sans skip | `TEST_DATABASE_URL=... pnpm test` : 81 fichiers, 926 tests, 0 skipped |

## Points d'attention pour la relecture
- Le comportement existait déjà : les deux tests ajoutés fixent le contrat plutôt qu'ils ne passent du rouge au vert (le refactor des contrats vers `LegacyAccounts` était le test rouge côté compilation).
- `SqliteSnapshotRepository.db` devient public.
- `storage-factory.ts` garde `Storage` avec les repositories de comptes jusqu'à S69.

## Hors périmètre remarqué
Les repositories de comptes et leurs contrats subsistent dans `src` (sortie prévue par d'autres stories).
