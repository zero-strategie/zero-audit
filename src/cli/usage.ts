export const USAGE = `Usage : zero-audit <url> [options]

Arguments
  url               URL de départ de l'audit (http ou https)

Options
  --limit <n>       nombre maximal de pages explorées (défaut : 100)
  --delay <ms>      délai entre deux requêtes en millisecondes (défaut : 1000,
                    variable ZERO_AUDIT_DELAY_MS)
  --db <chemin>     fichier de la base SQLite (défaut : ./.zero-audit/audit.db,
                    variable ZERO_AUDIT_DB_PATH)
  --json <fichier>  écrit le snapshot complet au format JSON
  --help            affiche cette aide
`;
