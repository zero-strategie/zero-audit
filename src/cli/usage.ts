export const USAGE = `Usage : zero-audit [audit] <url> [options]
        zero-audit compare <A> <B> [--db <chemin>]
        zero-audit serve [--port <n>] [--db <chemin>] [--store <type>]
        zero-audit migrate [--store <type>] [--db <chemin>]

Commandes
  audit <url>       lance un audit (commande par défaut : « audit » est facultatif)
  compare <A> <B>   compare deux snapshots terminés du même site (A = base, B = cible)
  migrate           applique les migrations du stockage puis rend la main
  serve             démarre l'API HTTP en lecture seule (HOST, défaut 127.0.0.1)

Arguments
  url               URL de départ de l'audit (http ou https)

Options
  --limit <n>       nombre maximal de pages explorées (défaut : 100)
  --delay <ms>      délai entre deux requêtes en millisecondes (défaut : 1000,
                    variable ZERO_AUDIT_DELAY_MS)
  --db <chemin>     fichier de la base SQLite (défaut : ./.zero-audit/audit.db,
                    variable ZERO_AUDIT_DB_PATH)
  --store <type>    stockage : sqlite (défaut) ou postgres (variable ZERO_AUDIT_STORE ;
                    postgres exige la variable DATABASE_URL)
  --port <n>        port de l'API pour serve (défaut : PORT, sinon 3000)
  --json <fichier>  écrit le snapshot complet au format JSON
  --help            affiche cette aide
`;
