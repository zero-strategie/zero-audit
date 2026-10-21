# S50 : Filtrer les routes de lecture selon le compte connecté

## Résumé

Les 8 cas d'usage de lecture reçoivent un `Reader` (anonyme ou compte) résolu depuis `X-Session-Id`. Une ressource d'un autre compte répond 404 avec le même corps qu'une ressource inexistante. Le contrôle est dans les cas d'usage, pas dans les routes (R1). `GET /projects` expose `owned` (jamais `ownerId`).

## Changements

- `src/domain/reader.ts` : type `Reader`, `ANONYMOUS_READER`, `canRead(reader, project)`, `readerUserId`.
- `src/application/auth/resolve-reader.ts` : session inconnue ou expirée = anonyme ; `isAdmin` via `adminEmails` (information seulement, A17 : aucun droit de lecture en plus).
- `src/application/readable-snapshot.ts` : `loadReadableSnapshot` charge snapshot et projet, lève `SnapshotNotFound` si absent ou illisible. Utilisé par `GetSnapshotReport`, `ListIssues`, `ListOccurrences`, `ListPages`, `CompareSnapshots`, `GetAuditProgress`.
- `GetAuditProgress` vérifie le propriétaire AVANT d'interroger l'état en mémoire du runner.
- `ListProjects` et `ListProjectSnapshots` filtrent selon le lecteur (`ProjectNotFound` pour un projet d'autrui).
- `CompareSnapshots` : la lecture des deux snapshots est contrôlée avant la comparaison des projets, donc 404 (et non 400) pour un snapshot d'autrui.
- `src/http/reader.ts` : `ReaderOf` (lit `X-Session-Id`), `sessionIdOf` déplacé depuis `routes/auth.ts`. Routes de lecture reçoivent `readerOf`.
- CLI : `ANONYMOUS_READER` (la CLI ne crée que des projets de la vitrine).
- Tests existants adaptés : signatures des cas d'usage, projets de vitrine explicites, `owned: false`, test de progression qui crée un vrai snapshot.

## Correspondance critères → tests

| critère | fichier:ligne du test |
|---|---|
| GET /projects anonyme : vitrine seule | tests/http/authorization-matrix.test.ts (`GET /projects`, anonymous) |
| GET /projects avec la session de U : U + vitrine, `owned`, pas V | tests/http/authorization-matrix.test.ts (`GET /projects`, u) |
| 6 routes de lecture, U sur ressources de V : 404 identique à l'inexistant | tests/http/authorization-matrix.test.ts (`describe.each(ROUTES)`, u reading a v resource) |
| mêmes 6 routes, anonyme : 404 | tests/http/authorization-matrix.test.ts (anonymous reading a u/v resource) |
| /compare : U+V = 404 ; U+U ou vitrine+vitrine = 200 | tests/http/authorization-matrix.test.ts (`GET /compare`) |
| progression d'un audit de V en cours : 404 | tests/http/authorization-matrix.test.ts (`does not read the in-memory progress`) |
| snapshot de la vitrine : 200 pour tous | tests/http/authorization-matrix.test.ts (`* reading a showcase resource`) |
| session inconnue ou expirée = anonyme | tests/http/authorization-matrix.test.ts (unknownSession, expiredSession) ; tests/application/auth/resolve-reader.test.ts |
| administrateur : ses projets + vitrine, 404 sur V | tests/http/authorization-matrix.test.ts (admin) |
| suite complète, Postgres inclus, lint, typecheck | `TEST_DATABASE_URL=… pnpm test` : aucun test sauté ; la matrice tourne sur mémoire et Postgres |

## Points d'attention pour la relecture

- `GetAuditProgress` charge désormais le snapshot complet (`getById`) à chaque interrogation pour vérifier le propriétaire : plus coûteux qu'avant pour un sondage fréquent. Un port léger « projet du snapshot » éviterait cela ; non fait pour rester dans le périmètre (3 adapters + contrat).
- Le corps du 404 est identique à celui d'une ressource inexistante (le message ne contient que l'identifiant demandé).
- `PRAGMA`/SQLite : non concerné, la matrice couvre mémoire et Postgres comme demandé.
- `X-Session-Id` n'est pas borné en longueur sur les routes de lecture (seulement par la limite d'en-têtes de Node).

## Hors périmètre remarqué

- `docs/developer-guide.md` (tableau des routes) ne mentionne pas encore `owned` ni le filtrage : à traiter dans la story de documentation.
