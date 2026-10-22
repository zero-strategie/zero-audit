# S127 - Hreflang, liens malformés, ressources http et flux déclarés

## Résumé
`ParsedHtml` expose `hreflang`, `malformedLinks`, `insecureResources` et `declaredFeeds`. Ils alimenteront les checks 23, 24, 25, 204, 44, 30 et le correctif 215. Aucun changement du crawl, de la persistance ni de `links`.

## Changements
- `src/application/ports/html-parser.ts` : type `Hreflang` et quatre champs.
- `src/domain/url.ts` : `isMalformedHref` (règle pure, A3), liste fermée de schémas http, https, mailto, tel, sms, ftp, javascript, data.
- `src/infrastructure/cheerio-html-parser.ts` : extraction. Les malformés sont captés avant `resolveUrl`, sans toucher `extractLinks`. Résolution contre `<base>`.
- Un commit par cycle TDD, rouge constaté à chaque fois (`undefined` à la place de la valeur attendue).

## Correspondance critères -> tests
| critère | fichier:ligne du test |
|---|---|
| hreflang `{lang, url absolue}` | tests/infrastructure/cheerio-html-parser.test.ts:278 |
| `http:/x`, `https//x`, `htp://x`, schéma hors liste -> malformedLinks (bruts, plafonnés, total) | :286 et :293 |
| `#`, vide, `javascript:void(0)` ignorés | :304 |
| liens existants inchangés | tests existants du fichier et de la suite, inchangés et verts |
| ressources http (img src/srcset, script, stylesheet, iframe, source, video poster, audio, embed, object), pas `<a>` | :321 |
| flux rss, atom, feed+json en URL absolue | :346 |

## Points d'attention pour la relecture
- `insecureResources` et `malformedLinks` sont des `CappedExamples` (plafond 20 + total). `insecureResources` contient les URL résolues ; seul un `http://` littéral compte (une URL protocole-relatif n'est pas signalée).
- Un `href` du type `localhost:3000/x` (schéma inconnu) est classé malformé, conformément à A3.
- `srcset` : découpage sur les virgules suivies d'un espace ou d'une URL absolue ; une URL avec virgule non suivie d'espace reste entière.
- Seuls les `<a href>` sont examinés pour les malformés (A4 : `<a>` relève de 31).
- Lint, typecheck et suite complète avec Postgres (1114 tests, 0 sauté) verts.

## Hors périmètre remarqué
Rien.
