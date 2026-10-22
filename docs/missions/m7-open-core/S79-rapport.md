# S79 - Réécrire le guide développeur pour le core et la publication

## Résumé
`docs/developer-guide.md` est réécrit en anglais pour le core : architecture, usage en bibliothèque, écriture d'un adapter de stockage, SSRF, worker et file, tests, publication. Les sections API/comptes, dashboard et Docker/déploiement ont disparu.

## Changements
- `docs/developer-guide.md` : nouvelles sections « Using the library » (`createStorage`, `storage.connection`, `AssertPublicTarget` avant `QueueAudit`, `Reader` neutre), « Writing a storage adapter » (ports, suites de contrat sans skip), « Publishing » (organisation npm, `NPM_TOKEN`, repo public pour la provenance R2, tarball ou git R10). Sections SSRF et Worker conservées, débarrassées de l'API et des comptes. Pied de page « source offer » du dashboard retiré de la section Licensing.
- `tests/deploy/developer-guide.test.ts` : nouveau.
- `tests/cli/project-files.test.ts` : le terme `docker compose up` n'est plus exigé dans les guides (contradictoire avec l'interdiction de « docker » dans README et guide utilisateur, et avec ce critère).

## Correspondance critères -> tests
| critère | fichier:ligne du test |
|---|---|
| Sections supprimées, ni fastify, ni docker, ni dashboard | tests/deploy/developer-guide.test.ts:13 |
| Titres Architecture / Using the library / Writing a storage adapter / Publishing | tests/deploy/developer-guide.test.ts:17 |
| Usage bibliothèque (createStorage, storage.connection, AssertPublicTarget avant QueueAudit, Reader, isAdmin) | tests/deploy/developer-guide.test.ts:24 |
| Ports et suites de contrat sans skip | tests/deploy/developer-guide.test.ts:39 |
| Prérequis de publication, tarball / git | tests/deploy/developer-guide.test.ts:55 |
| Commande de test locale | tests/deploy/developer-guide.test.ts:62 ; suite complète : 934 tests, 0 skipped |

## Points d'attention pour la relecture
- Le test ne vérifie que la présence des mots-clés ; les exemples de code ne sont pas compilés (noms vérifiés à la main contre `src/index.ts`).
- Le mot « docker » est évité même pour `docker-compose.yml` (écrit « compose file »).
- Le mode « git » de consommation est déconseillé : `prepublishOnly` ne s'exécute pas, `dist/` n'est pas versionné.

## Hors périmètre remarqué
- Aucun.
