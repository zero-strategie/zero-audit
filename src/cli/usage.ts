export const USAGE = `Usage : zero-audit [audit] <url> [options]
        zero-audit compare <A> <B> [--db <chemin>]
        zero-audit migrate [--store <type>] [--db <chemin>]
        zero-audit worker [--store <type>] [--db <chemin>]
        zero-audit worker-health [--store <type>] [--db <chemin>]

Commandes
  audit <url>       met un audit en file d'attente, sans propriétaire ni quota, et affiche
                    son identifiant et sa position (commande par défaut : « audit » est
                    facultatif). Un worker le traite ensuite.
  compare <A> <B>   compare deux snapshots terminés du même site (A = base, B = cible)
  migrate           applique les migrations du stockage puis rend la main
  worker            traite les audits en file (processus dédié) ; SIGTERM / SIGINT remet
                    l'audit en cours en file et sort en 0
  worker-health     sort en 0 si le worker de cet hôte s'est signalé il y a moins de 60 s,
                    sinon en 1

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
  --wait            attend la fin de l'audit traité par un worker puis affiche le résumé
                    (avertit si aucun worker n'est actif ; incompatible avec --direct)
  --direct          crawle dans le processus, sans passer par la file ni le worker
  --json <fichier>  écrit le snapshot complet au format JSON (avec --wait ou --direct)
  --help            affiche cette aide

Variables d'environnement du worker
  ZERO_AUDIT_WORKER_CONCURRENCY  audits traités en parallèle par « worker » (entier >= 1,
                                 défaut 1)
  ZERO_AUDIT_ALLOW_PRIVATE_TARGETS  « true » désactive la garde anti-SSRF du worker
`;
