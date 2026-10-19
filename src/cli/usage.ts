export const USAGE = `Usage : zero-audit [audit] <url> [options]
        zero-audit compare <A> <B> [--db <chemin>]
        zero-audit serve

Commandes
  audit <url>       lance un audit (commande par défaut : « audit » est facultatif)
  compare <A> <B>   compare deux snapshots terminés du même site (A = base, B = cible)
  serve             réservé (non disponible)

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
  --json <fichier>  écrit le snapshot complet au format JSON
  --help            affiche cette aide
`;
