# zero-audit

Technical SEO audit tool (crawler, checks, scoring) for Zero Stratégie.

- Team conventions: `.claude/equipe.md`
- Reference analysis: `docs/reference/`
- Current mission: `docs/missions/m1-crawler/`

## Development

Requires Node 22 and pnpm.

```
pnpm install
pnpm lint
pnpm typecheck
pnpm test        # no test may reach the Internet (global network guard)
```

Tests start a local HTTP fixture server (`tests/support/fixture-server.ts`). Production code must use undici's global dispatcher so the guard applies.

## Running an audit

```
pnpm zero-audit https://exemple.com --limit 50 --delay 500 --json audit.json
pnpm run audit https://exemple.com
```

`pnpm zero-audit audit <url>` is the explicit form of `pnpm zero-audit <url>`; `audit`, `compare` and `serve` are reserved words and are never read as URLs.

Use `pnpm run audit`, not `pnpm audit`: `pnpm audit` is pnpm's built-in vulnerability audit and never reaches the `audit` script. `pnpm zero-audit` is an alias without that conflict. After `pnpm build`, the `zero-audit` bin (`dist/cli/main.js`) can also be linked and run directly.

Options (an option wins over its environment variable, which wins over the default):

| Option | Environment variable | Default | Meaning |
|---|---|---|---|
| `<url>` | | required | start URL (http or https) |
| `--limit <n>` | | 100 | maximum number of pages crawled |
| `--delay <ms>` | `ZERO_AUDIT_DELAY_MS` | 1000 | delay between two requests |
| `--db <path>` | `ZERO_AUDIT_DB_PATH` | `./.zero-audit/audit.db` | SQLite database file |
| `--store <sqlite\|postgres>` | `ZERO_AUDIT_STORE` | `sqlite` | storage backend (audit and compare) |
| | `DATABASE_URL` | | Postgres connection URL, required with `--store postgres` |
| `--json <file>` | | none | writes the full snapshot (pages, links, all check results) as JSON |
| `--help` | | | prints the usage |

### Choosing the storage

SQLite stays the default. To use Postgres, start the local database and point `DATABASE_URL` at it (see `.env.example`; the schema is migrated automatically on first use):

```
POSTGRES_PASSWORD=<your password> docker compose up -d
DATABASE_URL=postgresql://zero_audit:<your password>@127.0.0.1:5432/zero_audit \
  pnpm zero-audit https://exemple.com --store postgres
```

The connection is closed at the end of the command and on Ctrl+C. Passwords are masked in error messages. `--db` only applies to SQLite.

The summary goes to stdout; the progress line (`crawled/limit`) goes to stderr, so stdout stays clean.

### Comparing two audits

```
pnpm zero-audit compare <A> <B> [--db <path>]
```

`A` is the base and `B` the target (snapshot ids are printed by the audit summary). For each check the output gives the counts in A and B, the delta, the new and fixed occurrences, then the occurrences added and removed. Both snapshots must be `finished` and belong to the same site. Exit codes: 0 success, 1 unknown, unfinished or cross-site snapshots, 2 invalid usage.

Exit codes: 0 success, 1 crawl failure (snapshot marked `failed`), 2 invalid usage (nothing is requested or stored), 130 interrupted with Ctrl+C (snapshot marked `failed`).

### Serving the API

```
pnpm zero-audit serve [--port <n>] [--db <path>] [--store <sqlite|postgres>]
```

Starts a read-only HTTP API on `127.0.0.1` (port 3000 by default, `--port` to change it; there is no host option). There is no authentication and no CORS: the API is meant to be read by the dashboard's server on the same machine, so do not expose the port. `--db`, `--store` and `DATABASE_URL` behave as for an audit. Ctrl+C stops the server and releases the storage.

| Route | Answer |
| --- | --- |
| `GET /projects` | projects with their latest finished snapshot (`id`, `finishedAt`, rounded `health`, or `null`) |
| `GET /projects/:id/snapshots` | snapshots of a project (UUID), most recent first, with `status` and `health` (`null` unless finished) |
| `GET /snapshots/:id` | summary: health and themes with variation, counters, page groups, site files, top 5 checks |

Errors share one format: `{ "error": { "code": "not_found" | "invalid_request", "message": "…" } }` (404 unknown id or route, 400 malformed id). Any non-GET method answers 404. An unexpected failure answers 500 with the code `internal_error` and a generic message.
