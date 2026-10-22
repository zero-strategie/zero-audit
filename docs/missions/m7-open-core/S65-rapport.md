# S65 - Extraire la garde SSRF en amont dans AssertPublicTarget

## Résumé
Nouveau cas d'usage `AssertPublicTarget` (constructeur : le seul `HostResolver`). `LaunchAudit`, `LaunchQuota`, le domaine `quota` et leurs tests sont supprimés, ainsi que `QuotaExceeded`/`QuotaDenial`. La garde au crawl n'est pas touchée (diff vide contre `main`).

## Changements
- Ajout : `src/application/assert-public-target.ts` (reprend `hostOf` et la vérification d'adresses de `launch-audit.ts`).
- Suppression : `launch-audit.ts`, `launch-quota.ts`, `domain/quota.ts`, `auth/get-current-account.ts`, tests `launch-audit`, `launch-quota`, `domain/quota`, et les deux cas `GetCurrentAccount` de `tests/application/auth/sessions.test.ts`.
- `purge-stale-accounts.ts` : `QUOTA_WINDOW_MS` remplacé par une constante locale `LAUNCH_JOURNAL_RETENTION_MS` (24 h, même valeur, comportement identique).
- `errors.ts` : `QuotaExceeded` et `QuotaDenial` retirés.

## Correspondance critères -> tests
Tous dans `tests/application/assert-public-target.test.ts` (cas SSRF de l'ancien test `LaunchAudit` repris : adresse privée, littéral sans résolution, plusieurs adresses, échec de résolution, URL sans hôte).

| critère | fichier:ligne du test |
|---|---|
| 10.0.0.5 -> PrivateAddressRejected (hôte + adresse) | assert-public-target.test.ts:30 |
| 127.0.0.1 / [::1] sans appel du résolveur | assert-public-target.test.ts:38 |
| [::ffff:192.168.1.1] adresse normalisée | assert-public-target.test.ts:51 |
| une seule adresse interne suffit | assert-public-target.test.ts:60 |
| adresses publiques : résolu | assert-public-target.test.ts:68 |
| `pas-une-url` -> InvalidAuditUrl | assert-public-target.test.ts:74 |
| HostNotResolved propagée | assert-public-target.test.ts:84 |
| signature sans drapeau | constructeur `(resolver: HostResolver)`, vérifié par typecheck |
| fichiers supprimés, diff vide sur la garde au crawl | `git ls-files`, `git diff main -- ...` vides |
| suite complète sans skip | 98 fichiers, 1003 tests passés ; lint et typecheck verts |

## Points d'attention pour la relecture
- L'adresse « normalisée » d'un littéral IPv4-mappé est `::ffff:c0a8:101` : l'URL est canonicalisée par `new URL`, puis `normalizeIpLiteral` ne la convertit pas en IPv4. Comportement identique à l'ancien `LaunchAudit` ; le test fige cette forme (le critère ne donne pas la valeur exacte).
- `GetCurrentAccount` dépendait de `LaunchQuota` : supprimé ici (seul son test dans `sessions.test.ts` l'utilisait), il serait parti en S66 de toute façon.
- `developer-guide.md` mentionne encore `LaunchAudit` et les quotas : à réécrire avec la documentation.

## Hors périmètre remarqué
- Le commentaire de `PurgeReport.launches` parle encore de « quota window ». La purge est retirée en S67.
- `listLaunchedAtBy` / `countApiLaunchedSince` restent sur les ports (A1, inchangés).
