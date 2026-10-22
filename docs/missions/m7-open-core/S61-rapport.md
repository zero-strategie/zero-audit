# S61 – Verrouiller les migrations existantes par empreinte

## Résumé
Un test échoue dès qu'une migration Postgres (001-006) ou SQLite (001-011) est ajoutée, supprimée, renommée ou modifiée. Aucun code de production touché.

## Changements
- `tests/infrastructure/migrations-lock.test.ts` : fonction pure `diffMigrationLock(expected, actual)` (message « migrations are frozen: <fichier> »), tables d'empreintes SHA-256 prises sur `main`, lecture des fichiers réels via `readdirSync`/`readFileSync`.

## Correspondance critères → tests
| critère | fichier:ligne du test |
|---|---|
| 6 fichiers Postgres et 11 SQLite identiques à `main` | tests/infrastructure/migrations-lock.test.ts (« keeps exactly the 6 Postgres… », « …11 SQLite… ») |
| contenu modifié nomme le fichier | tests/infrastructure/migrations-lock.test.ts (« names a file whose fingerprint changed ») |
| fichier ajouté / absent nommé | tests/infrastructure/migrations-lock.test.ts (« names an added file », « names a missing file ») |
| `git diff main` vide sur migrations et migrate.ts | vérifié manuellement : sortie vide |
| suite complète avec Postgres, sans skip | `TEST_DATABASE_URL=… pnpm test` : vert, 0 skipped |

## Points d'attention pour la relecture
- La fonction de comparaison vit dans le fichier de test (test seul, comme demandé).
- Rouge constaté d'abord avec une version vide : 3 assertions fausses (`expected [] to deeply equal [...]`).

## Hors périmètre remarqué
Rien.
