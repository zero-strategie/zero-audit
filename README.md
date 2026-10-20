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

The repository is a pnpm workspace (`pnpm-workspace.yaml`): the root package holds the core, the CLI and the API; `web/` is the Astro dashboard. `pnpm install` at the root installs both. The root `lint`, `typecheck` (including `astro check`) and `test` (including web/'s Vitest project, which renders components with Astro's Container API) cover `web/`, and CI runs them without a browser. `web/` must not import `src/` (enforced by ESLint): it only talks to the HTTP API.

```
pnpm --filter web dev      # dev server on http://127.0.0.1:4321
pnpm --filter web build
pnpm --filter web start    # serves the build on http://127.0.0.1:4321
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

Each audit also writes one JSON line per event on stdout, for `docker logs`: `audit.started`, then `audit.finished` (with `pagesCount` and `health`) or `audit.failed` (also on SIGINT/SIGTERM). Every line carries `timestamp`, `snapshotId` and `rootUrl`, never a stack trace.

### `migrate`

`zero-audit migrate [--store sqlite|postgres] [--db <path>]` applies the pending migrations and exits (0 on success, 1 on failure, 2 on a usage error). It opens no server. Opening the storage still migrates automatically; `migrate` is meant for `deploy.sh`, before the health check. Postgres migrations are serialized by an advisory lock.

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

Starts a read-only HTTP API. It listens on `HOST` (default `127.0.0.1`) and on `--port`, else `PORT`, else 3000. An invalid port (not an integer between 1 and 65535) makes the command fail with a message and a non-zero exit code. Set `HOST=0.0.0.0` only inside a container. There is no authentication and no CORS: the API must only be published on `127.0.0.1` (for example `127.0.0.1:3000:3000` in Docker), the dashboard's server reading it from the same machine. `--db`, `--store` and `DATABASE_URL` behave as for an audit. Ctrl+C (SIGINT) and `SIGTERM` (`docker stop`) release the storage: an audit in progress is marked `failed`; a stopped `serve` closes the server, then the storage, and exits 0.

The web server (`web/`, Astro standalone) reads `HOST`, `PORT` and `ZERO_AUDIT_API_URL` at runtime; they take precedence over `server.host` and `server.port` in `web/astro.config.mjs`, which only apply to `astro dev`. `.env.example` lists the variables of each image.

| Route | Answer |
| --- | --- |
| `GET /projects` | projects with their latest finished snapshot (`id`, `finishedAt`, rounded `health`, or `null`) |
| `GET /projects/:id/snapshots` | snapshots of a project (UUID), most recent first, with `status` and `health` (`null` unless finished) |
| `GET /snapshots/:id` | summary: health and themes with variation, counters, page groups, site files, top 5 checks |

### Health checks

Both servers expose `GET /health` for `deploy.sh` and the deployment job. The body is a short JSON object that never contains an internal URL or an error detail.

| Server | Check | 200 | 503 |
| --- | --- | --- | --- |
| API | the storage (SQLite or Postgres) answers a trivial query | `{"status":"ok"}` | `{"status":"unavailable"}` |
| Web | the API answers `GET /health` with 200 within 2 seconds | `{"status":"ok"}` | `{"status":"unavailable"}` (API down, slow or unhealthy) |

Any other method on the API's `/health` answers 404. **Requirement for zero-infra:** Caddy protects the application with basic auth, so `/health` must be exempted from it on both hosts; otherwise the health check of `deploy.sh` and of the deployment job gets a 401.

Errors share one format: `{ "error": { "code": "not_found" | "invalid_request", "message": "…" } }` (404 unknown id or route, 400 malformed id). Any non-GET method answers 404. An unexpected failure answers 500 with the code `internal_error` and a generic message.
