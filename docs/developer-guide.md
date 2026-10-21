# Developer guide

This guide explains how zero-audit is built, how to run its tests, and how to extend it. To use the tool, see the [user guide](user-guide.md).

- [Setup](#setup)
- [Repository layout](#repository-layout)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Add a check](#add-a-check)
- [Storage adapters and migrations](#storage-adapters-and-migrations)
- [HTTP API](#http-api)
- [Dashboard](#dashboard)
- [Testing](#testing)
- [Docker, CI and deployment](#docker-ci-and-deployment)
- [Conventions](#conventions)
- [Licensing](#licensing)
- [Third-party licences](#third-party-licences)

## Setup

You need **Node.js 22** and **pnpm** (the version is pinned in `package.json`). Docker is not required to develop or to run the test suite.

```sh
pnpm install
pnpm lint        # ESLint (typescript-eslint strict), root and web/
pnpm typecheck   # tsc --noEmit, plus astro check for web/
pnpm test        # Vitest, root and web/
pnpm format      # Prettier
pnpm build       # compiles the core, CLI and API to dist/
```

Run a single test file with `pnpm vitest run tests/domain/scoring.test.ts`. For the dashboard, run `pnpm --filter web vitest run …`.

The stack:

- TypeScript (strict, ESM);
- [undici](https://undici.nodejs.org) for HTTP, [cheerio](https://cheerio.js.org) for HTML, [robots-parser](https://github.com/samclarke/robots-parser), [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) for sitemaps;
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) and [pg](https://node-postgres.com) for storage;
- [Fastify](https://fastify.dev) for the API;
- [Astro](https://astro.build) for the dashboard.

## Repository layout

The repository is a pnpm workspace.

- **Root package**: the core, the CLI and the API.
- **`web/`**: the dashboard. It must not import from `src/`, and ESLint enforces this: the dashboard only talks to the HTTP API.

```text
src/
  domain/          pure logic, no I/O: crawl model, checks, scoring, diffing, page groups
    checks/page/   checks that examine pages one by one
    checks/site/   checks that examine the site as a whole
  application/     use cases (RunAudit, CompareSnapshots, ListPages…) and ports/
  infrastructure/  adapters: undici, cheerio, robots-parser, sqlite/, postgres/, clock…
  cli/             command-line adapter (argument parsing, rendering)
  http/            Fastify adapter (routes, JSON schemas, presenters)
web/               Astro dashboard (SSR, @astrojs/node standalone)
tests/             mirrors src/, plus support/ (fixture server, contract suites)
docs/              user guide, developer guide, checks reference
```

## Architecture

zero-audit follows a hexagonal architecture.

- The **domain** knows nothing about HTTP, HTML parsing or databases.
- The **application** layer orchestrates use cases through **ports**: the interfaces in `src/application/ports/`.
- **Adapters** in `infrastructure/`, `cli/` and `http/` implement or drive those ports.

An audit flows through these steps (`src/application/run-audit.ts`):

1. **Discover**: `discover-site.ts` resolves redirects of the start URL, reads `robots.txt` (port `RobotsPolicy`) and the sitemaps (`SitemapReader`), and records their status as *site files*.
2. **Crawl**: `bfs-crawler.ts` runs a breadth-first crawl limited to the start host, up to `--limit` pages. It goes through `polite-http-client.ts`, which waits the politeness delay before every request.
   - Robots-blocked URLs are recorded as blocked pages without being requested.
   - Each HTML page is parsed (`HtmlParser`) into title, meta description, canonical, headings, word count, text ratio and links.
3. **Probe**: the crawler then probes the trailing-slash variant of each HTML page and the alternate host (`www.` or apex) of the home page.
4. **Check**: `run-checks.ts` runs every check of the registry on the `CrawlResult` and produces one `CheckResult` per check (`count`, `examined`, occurrences).
5. **Store**: the snapshot, with pages, links, probes, site files, check results and occurrences, goes into the `SnapshotRepository`. It is finished atomically, and a finished snapshot is immutable.

Everything derived is computed **when it is read**, never stored:

- scores (`domain/scoring.ts`);
- deltas against the previous finished snapshot of the project (`domain/snapshot-diff.ts`);
- page groups (`domain/page-groups.ts`);
- top issues.

This way, past audits benefit from formula changes.

`CompareSnapshots`, `GetSnapshotReport`, `ListIssues`, `ListOccurrences`, `ListPages` and `ListProjects` are the read-side use cases. The CLI and the API both use them.

## Data model

| Table | Content |
|---|---|
| `projects` | one row per normalised start URL |
| `snapshots` | one audit: project, status (`running`, `finished`, `failed`), start and end dates, pages crawled, limit |
| `pages` | crawled and blocked pages: URL, depth, status, headers, response time, content type, title, meta description, canonical, h1, word count, text ratio, error |
| `links` | links found on each page: source, target, type, `rel`, anchor text |
| `site_files` | `robots.txt`, sitemaps, `llms.txt`: URL, status, error |
| `host_probes`, `slash_probes` | URL-variant probes (check 1000) |
| `check_results` | per check: severity, theme, `count`, `examined` |
| `issue_occurrences` | per occurrence: check, page URL, `info` (JSON) |

The domain types are in `src/domain/crawl.ts`, `snapshot.ts`, `project.ts` and `check.ts`.

## Add a check

A check is a plain object implementing `PageCheck` or `SiteCheck` (`src/domain/check.ts`):

- it declares `id`, `severity`, `theme` and a French `label`;
- it has a pure `run({ crawl })` that returns occurrences;
- a page check also has `applies(page)`, which defines what counts as examined.

1. **Pick an id.**
   - Reuse the conventional id if the check exists in common site-audit tools.
   - Otherwise take the next free id in **1000–1999**. Only then are you free to choose the severity.
   - Write your own label. Tests reject a label that matches a known reference title (`tests/support/catalogue-title-hashes.json`).
2. **Write the failing tests first** in `tests/domain/checks/page-checks.test.ts` or `site-checks.test.ts`. Build a `CrawlResult` with the helpers in `tests/support/check-fixtures.ts`. Cover:
   - what is flagged and what is not;
   - the `examined` count;
   - the id and severity, via `expectCatalogueMetadata`;
   - the label, via `expectNoCatalogueTitleCopied`.
3. **Implement it** in `src/domain/checks/page/check-<id>-<slug>.ts` or `site/…`, and add it to the list in `index.ts` of the same folder.
   - Put thresholds in `src/domain/thresholds.ts`.
   - If the check needs data the crawler does not collect yet, add it to `Page` (`domain/crawl.ts`), to the HTML parser, and to both storage adapters with a migration (next section).
4. **Update the totals.**
   - `tests/application/full-registry.test.ts` asserts the full list of checks.
   - Theme mapping is tested in `tests/domain/checks/check-themes.test.ts`.
   - Update [`docs/checks.md`](checks.md).
5. **Optionally test end to end** against the local fixture server, like `tests/cli/run-cli-new-checks.test.ts`.

Nothing else is needed: the CLI, the API and the dashboard list checks from the registry. `GET /checks` exposes it.

## Storage adapters and migrations

Two ports, `ProjectRepository` and `SnapshotRepository`, have three adapters each:

- **in-memory**, for unit tests;
- **SQLite** (`src/infrastructure/sqlite/`);
- **Postgres** (`src/infrastructure/postgres/`).

All of them must pass the **same contract suites**, `tests/support/project-repository-contract.ts` and `snapshot-repository-contract.ts`. The suites cover:

- immutability of finished snapshots;
- atomicity;
- ordering;
- the previous-snapshot lookup;
- the read-back of every stored field.

Add a test to the contract suite rather than to one adapter.

Migrations are versioned SQL files, applied in order and recorded in the database:

- `src/infrastructure/sqlite/migrations/NNN_name.sql`;
- `src/infrastructure/postgres/migrations/NNN_name.sql`.

Postgres migrations are serialised by an advisory lock. Opening a storage migrates it automatically, and `zero-audit migrate` does it explicitly.

Migrations are **additive**: never edit one that has shipped. Add a new file to **both** folders. The numbering differs between the two, because Postgres started with a consolidated `001_init.sql`.

`src/cli/storage-factory.ts` picks the adapter from `--store` or `ZERO_AUDIT_STORE`, plus `DATABASE_URL`.

## HTTP API

The API listens on `HOST:PORT`, `127.0.0.1:3000` by default and must never be exposed publicly: it trusts the web server, which relays the visitor's session in `X-Session-Id` (and the address in `X-Real-IP`). See [Accounts and security](#accounts-and-security). Apart from `POST /audits` and the `/auth/*` routes, it is read-only. Routes live in `src/http/routes/`. Their inputs are validated by JSON schemas, and the response bodies are shaped by `presenters.ts`.

| Route | Answer |
|---|---|
| `GET /health` | `200 {"status":"ok"}` when the storage answers, else `503 {"status":"unavailable"}` |
| `GET /checks` | the registry: `id`, `label`, `severity`, `theme` |
| `GET /projects` | projects with their latest finished snapshot (`id`, `finishedAt`, `health`) |
| `GET /projects/:id/snapshots` | snapshots of a project, most recent first, with `status` and `health` |
| `GET /snapshots/:id` | report: health and theme scores with variation, counts per severity, page groups, site files, top 5 issues |
| `GET /snapshots/:id/issues?severity=` | every check with `count`, `examined`, delta, new and fixed counts |
| `GET /snapshots/:id/issues/:checkId?page=&limit=` | occurrences of one check, paginated |
| `GET /snapshots/:id/pages?page=&limit=&sort=` | crawled pages with group, issue count and response time. `sort` is one of `url`, `status`, `depth`, `issues`, `responseTime`, prefixed with `-` for descending order. |
| `GET /snapshots/:id/progress` | `200 {status, pagesCrawled, pagesLimit, startedAt, rootUrl, queuePosition, attempts}`; `404` for an unknown id. `queuePosition` (null unless queued) and `attempts` are added. See [Worker and queue](#worker-and-queue). |
| `POST /audits` | launches a background audit, see below |
| `GET /compare?a=&b=` | comparison of two finished snapshots of the same project |

### `POST /audits`

Body: `{ "url": "https://site.test/", "limit": 100 }`. `url` is required and must start with `http://` or `https://` (no scheme is added for the caller). `limit` is one of 50, 100, 250 or 500 and defaults to 100. The call returns as soon as the audit is queued; follow it with `GET /snapshots/:id/progress`. See [Worker and queue](#worker-and-queue).

- **202** `{ "snapshotId", "projectId" }`: the audit is `queued`.
- **400** `invalid_request`: bad body or `limit`; a host with at least one non-public address (literal IP, or any resolved address); a domain that does not resolve (`Site introuvable : le nom de domaine ne résout pas`). Nothing is queued.
- **409** `conflict`: the account already has an audit `queued` or `running`.
- **429** `quota_exceeded`: a quota is reached, or the queue is full (`La file d'attente est pleine`, no `Retry-After`).

The address check (`LaunchAudit`, `HostResolver` port, `DnsHostResolver` adapter) is a fast pre-check; the connection-time guard of the HTTP client remains the authority. `ZERO_AUDIT_ALLOW_PRIVATE_TARGETS=true` turns both off. `PUT`, `DELETE` and `GET` on `/audits` answer 404.

Pagination:

- `page` starts at 1;
- `limit` defaults to 50, with a maximum of 200;
- responses carry `items`, `total`, `page` and `limit`.

Errors share one format: `{ "error": { "code": "not_found" | "invalid_request" | "conflict" | "internal_error", "message": "…" } }`.

- **404**: unknown id or route.
- **400**: invalid parameter, or a comparison across sites.
- **409**: an audit is already running.
- **500**: unexpected failure, returned with a generic message.

Tests use `fastify.inject()` and never open a port. See `tests/http/`.

## Accounts and security

- **Sessions**: opened by `POST /auth/login` or an e-mail confirmation. Only the hash of the session id and of e-mail tokens is stored. A session lasts 30 days, absolute (`SESSION_TTL_MS`). The web keeps the id in an HTTP-only cookie and sends it to the API as `X-Session-Id` (`src/http/reader.ts`). Logout deletes the current session; a password reset or an account deletion deletes all of them. Passwords are hashed with scrypt from `node:crypto`.
- **Mailer** (`ZERO_AUDIT_MAILER`): unset means disabled (sign-up, resend and reset answer 503); `console` writes links to the output and is forbidden in production (`serve` warns); `brevo` calls the Brevo HTTP API with undici, and needs `ZERO_AUDIT_BREVO_API_KEY` and `ZERO_AUDIT_PUBLIC_URL`. Only the console adapter ever writes a link to a log.
- **Authorization**: every read goes through a `Reader`. A project without owner belongs to the showcase and is readable by everyone; a private project is readable by its owner only. Another account's resource answers **404**, never 403, so ids cannot be probed. Administrators (`ZERO_AUDIT_ADMIN_EMAILS`, compared case-insensitively, address still verified) get no access to other accounts' data.
- **Quotas** (`src/domain/quota.ts`): regular accounts 100 pages and 3 audits per rolling 24 hours; administrators 500 pages. `ZERO_AUDIT_LAUNCHES_PER_DAY` is a global ceiling on 24 hours. Refusals are 429 `quota_exceeded` with a French message. The CLI is not limited. Counts come from the `api_launches` journal (SQLite migration 010, Postgres 005): one row per API launch, written by `SnapshotRepository.create` in the same transaction as the snapshot, keyed by the SHA-256 of the address and without foreign key to `users`, so erasing an account never lowers a quota. The daily purge drops rows older than 24 hours (`AccountEraser.purgeLaunchesBefore`).
- **Abuse limits** (`src/domain/abuse-limits.ts`): login failures per account (5) and per IP (20) over 15 minutes, 5 sign-ups per IP per hour, 3 e-mailed links per address per hour (counted in the database). The in-memory `RateLimiter` fits the single API instance. The sign-up form has a honeypot field. Messages stay generic wherever they could reveal whether an account exists.
- **Purge**: `serve` runs `PurgeStaleAccounts` at startup then daily (`src/cli/daily-purge.ts`): unverified accounts older than 7 days, expired sessions and tokens, and launch journal rows older than 24 hours. Erasure goes through the separate `AccountEraser` port, table by table in a transaction, with no `ON DELETE CASCADE`.
- **Web**: pages redirect anonymous visitors to `/connexion?retour=<path>` (`safeReturnPath` only accepts local paths). `checkOrigin` and `isSameOrigin` stay on for every POST. The privacy page is `web/src/pages/confidentialite.astro`; its contact address is the single constant in `web/src/lib/contact.ts`.
- **Variables**: `ZERO_AUDIT_PUBLIC_URL`, `ZERO_AUDIT_MAILER`, `ZERO_AUDIT_BREVO_API_KEY`, `ZERO_AUDIT_MAIL_FROM`, `ZERO_AUDIT_ADMIN_EMAILS`, `ZERO_AUDIT_LAUNCHES_PER_DAY`; see `.env.example`.
- **Removing the basic auth**: the Caddy `basic_auth` block lives in zero-infra. It is removed there, in a separate PR, after this one is deployed and the mailer is configured; nothing in this repository changes it.

## SSRF guard

The server (`serve`) crawls any public site on request, so its HTTP client must never reach an internal service such as Postgres or the API on the Docker network. `UndiciHttpClient` enforces this when built with `blockPrivateAddresses: true`; the `audit` command does not enable it.

- **Refused ranges** (`src/domain/network-address.ts`, `isPublicAddress`): `0.0.0.0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16`, `172.16/12`, `192.168/16`, `224/4` and `240/4` (including `255.255.255.255`), plus `::`, `::1`, `fc00::/7`, `fe80::/10` and every IPv4-mapped address (`::ffff:0:0/96`).
- **Name resolution**: the undici agent has a custom `connect.lookup`. It keeps only public addresses and fails if none is left, so a host with one internal and one public address is still reachable on the public one. Node 22 calls `lookup` with `all: true` (autoSelectFamily), others with the simple form; both are handled. Checking at connection time also covers DNS rebinding and every redirect hop, because redirects are not followed by the client: each hop is a new request.
- **Literal IPs**: `lookup` is not called for an IP in the URL, so `get` checks `new URL(url).hostname` before `fetch` (`new URL` already normalises forms such as `0x7f.1` to `127.0.0.1`).
- **`blocked`**: a refused request is a `NetworkFailure` of kind `blocked`. The crawler records it like any other network error; if the root itself is blocked the audit fails with `RootUnreachable`.
- **`ZERO_AUDIT_ALLOW_PRIVATE_TARGETS`**: read by `serve` only. The exact value `true` turns the guard off (`allowPrivateTargets`); `TRUE`, `1` or `yes` do not.

## Worker and queue

`POST /audits` (`LaunchAudit`) never crawls: it checks the quotas and the SSRF guard, then `AuditQueue.enqueue` inserts a `queued` snapshot and answers 202. A worker (`ProcessAuditQueue`) claims the audits one by one (`claimNext`, safe against concurrent workers) in the order of `queued_at`. The queue lives in the `snapshots` table: no Redis, no extra dependency.

- **Admission**: `LaunchQuota.assertAdmitted` runs inside the transaction of `enqueue`, serialised by `pg_advisory_xact_lock` (Postgres) or `BEGIN IMMEDIATE` (SQLite). Order: quotas, then one `queued` or `running` audit per account (409, administrators included), then the ceiling of waiting audits `ZERO_AUDIT_QUEUE_MAX` (429 `quota_exceeded`; running audits do not count). The command line is outside these limits.
- **Worker mode**: `ZERO_AUDIT_WORKER` is `embedded` (default: `serve` runs the worker loop, and stops it on shutdown, which puts the running audit back in the queue) or `external` (another process runs the worker; audits stay `queued` until one runs). Any other value stops `serve` at startup. `embedded` is the default so that a deployment without a worker container keeps running audits. The SSRF guard of the worker follows `ZERO_AUDIT_ALLOW_PRIVATE_TARGETS`, including for audits queued by the CLI.
- **`zero-audit worker`**: dedicated process; `ZERO_AUDIT_WORKER_CONCURRENCY` (default 1) audits in parallel. Its identity is `os.hostname()` (suffixed when concurrency is above 1). `SIGTERM` or `SIGINT` puts the running audit back in the queue and exits 0.
- **`zero-audit worker-health`**: exits 0 if the worker of this host signalled itself less than 60 s ago, else 1. It is the compose healthcheck. The worker has its own presence heartbeat every 15 s, independent of the pages crawled.
- **CLI**: `zero-audit <url>` queues the audit (no owner, no quota, not subject to the queue ceiling) and prints its id and position. `--wait` follows it until the end and prints the summary (a warning appears if no worker is active; the wait is otherwise unbounded). `--direct` crawls in the process, outside the queue, with the previous behaviour (`--wait` and `--direct` are exclusive).
- **Progress**: `GET /snapshots/:id/progress` reads everything from the database: status, `pagesCrawled` (last heartbeat), `pagesLimit`, `queuePosition` and `attempts`.
- **Account deletion**: refused with 409 while an audit of the account is `queued` or `running` with a heartbeat of less than 2 minutes.

### Recovery and failure

- **Orphans**: `RecoverStaleAudits` (worker loop, and `serve` at startup) puts back in the queue every `running` audit whose heartbeat is older than 2 minutes, keeping its original `queued_at` (so it is resumed first). The audit restarts from zero.
- **Two attempts at most**: after the second interruption the audit is marked `failed`. Two deployments during the same audit therefore fail it. A `SIGTERM` during attempt 2/2 also ends in `failed`. `heartbeat`, `finish` and `fail` are conditional on `status = 'running' AND attempts = <claimed attempt>`: a refused write makes the worker abandon the attempt.
- **Legacy audits** without a heartbeat (`--direct`, rows older than the migration) are marked `failed` once they are 6 hours old (`LEGACY_ORPHAN_AGE_MS`), never earlier.
- **Rollback with queued audits (R5)**: rolling back to a version without a worker leaves the `queued` audits untouched; the old version ignores them and the migration stays compatible (the snapshots table was rebuilt to allow the `queued` status). They are processed again at the next deployment. Until then they count against the account's single audit.
- **Weekly timer without `--wait` (R6)**: a timer that runs `zero-audit <url>` now only queues the audit and returns 0 at once, with no summary. Add `--wait` (or `--direct`) to keep the old behaviour of a command that ends with the audit. A worker must be running (`embedded` serve or `external`).
- **`stop_grace_period` (R7)**: give the worker container a `stop_grace_period` of at least 30 s so that it can put its audit back in the queue before `SIGKILL`. After a `kill -9` the heartbeat expires after 2 minutes and the audit is recovered anyway.
- **Exception to append-only (R4)**: finished snapshots stay immutable, but `requeue` and `recoverStale` delete the child rows (pages, links, issues) of an interrupted attempt so that the restart begins clean.

## Dashboard

`web/` is an Astro app, rendered on the server by `@astrojs/node` in standalone mode.

- Pages fetch the API from the server through the client in `web/src/lib/api/`; the browser never calls the API.
- Styling is hand-written CSS in `web/src/styles/`, no CSS framework and **no client-side JavaScript** (tested):
  - `tokens.css`: the "Sismographe" palette (light and dark, contrast-tested), type, space and motion tokens;
  - `fonts.css`: self-hosted Bricolage Grotesque and Martian Mono (subset woff2, SIL OFL, see `web/public/fonts`) with metric-matched fallbacks, so the font swap does not shift layout;
  - `motion.css`: keyframes and the motion grammar. Durations `--dur-micro` 120 ms to `--dur-long` 900 ms, `--ease-out` for entrances, `--ease-needle` (a `linear()` spring) for the gauge, 40 ms stagger capped at 8 items. Page changes morph with cross-document view transitions (`@view-transition`), lists enter with `.enter` and `--i`, tables reveal rows with `animation-timeline: view()` where supported;
  - only `transform` and `opacity` are animated, plus two reviewed exceptions that repaint one small element and never move the layout: the gauge arc (`stroke-dashoffset`) and the score counter (`@property --n`). `web/tests/motion.test.ts` enforces it;
  - `prefers-reduced-motion`: nothing travels, short fades remain, values appear at their final state.
- Components are in `web/src/components/`.

Dashboard tests render pages and components with Astro's **Container API** and a stubbed API client. They need no browser. See `web/tests/`.

The dashboard reads `HOST`, `PORT` and `ZERO_AUDIT_API_URL` at runtime. For the dev server, `pnpm --filter web dev` serves it on `127.0.0.1:4321`.

Form posts are protected twice. Astro's `security.checkOrigin` stays on, and `isSameOrigin` (`web/src/lib/same-origin.ts`) is called by every page that handles a POST. Behind Caddy the server only sees `127.0.0.1:4321`, so `astro.config.mjs` sets `security.allowedDomains` from `ZERO_AUDIT_PUBLIC_HOSTS` (comma-separated host names, read at **build** time, for example `audit.zero-strategie.dev`). Astro then trusts `X-Forwarded-Host` and `X-Forwarded-Proto` for these hosts only, which is safe because the server listens on loopback and Caddy overwrites those headers. Without the variable, any host over https is accepted. The `Dockerfile` exposes it as a build argument (`--build-arg ZERO_AUDIT_PUBLIC_HOSTS=...`); the CI does not pass it yet, so published images use the fallback. A POST from another origin still gets a 403.

## Testing

- **TDD.** Write the failing test first, watch it fail, then make it pass.
- **No test may reach the Internet.** `tests/support/network-guard.setup.ts` installs an undici `MockAgent` that refuses every host but `127.0.0.1` and `localhost`. Production code must use undici's global dispatcher so the guard applies.
- **Crawl against a local fixture server.** `tests/support/fixture-server.ts` starts a `node:http` server from a map of routes to responses. Use it for anything that goes through HTTP.
- **Postgres tests** run when `TEST_DATABASE_URL` is set and are skipped otherwise. CI provides a Postgres service and fails if they are skipped. Before pushing a storage change, run them locally:

  ```sh
  createdb zero_audit_test   # or use docker compose up -d postgres
  TEST_DATABASE_URL=postgresql://zero_audit:<password>@127.0.0.1:5432/zero_audit_test pnpm test
  ```

  Use a throwaway database: the tests create and drop data freely.
- **Deployment files** (`Dockerfile`, `docker-compose.yml`, CI workflow) have static tests in `tests/deploy/`.

## Docker, CI and deployment

A single `Dockerfile` has two targets. Both are built from Node 22 `bookworm-slim` and run as a non-root user.

- **`api`**:
  - entry point `node dist/cli/main.js`;
  - default command `serve`, with `HOST=0.0.0.0` and port 3000;
  - `docker run … zero-audit-api migrate` and `… audit <url>` run the other commands;
  - the compose `worker` service uses the same image with the command `worker` and `worker-health` as healthcheck; the `api` service sets `ZERO_AUDIT_WORKER=external`.
- **`web`**: `node dist/server/entry.mjs` on port 4321.

```sh
docker build --target api -t zero-audit-api .
docker build --target web -t zero-audit-web .
POSTGRES_PASSWORD=change-me docker compose up --build   # full local stack
```

`.github/workflows/ci.yml` runs three jobs:

- **`verify`** runs on every push and pull request: lint, typecheck, tests with a Postgres service, both image builds (without pushing them), and `actionlint`.
- **`build-and-push`** runs on `main` only. It publishes `ghcr.io/<owner>/zero-audit-api` and `-web`, tagged with the 12-character commit SHA and `latest`.
- **`deploy`** runs on `main` only and is disabled until the repository variable `DEPLOY_ENABLED` is `true`. It connects over SSH and runs `/opt/zero-audit/deploy.sh <tag>` on the server, which pulls, migrates, health-checks and rolls back on failure. It then polls the public `/health`. It needs the secrets `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT` and `DEPLOY_KNOWN_HOSTS`, in a `production` environment.

Server provisioning (reverse proxy, TLS, scheduled audits, backups) is outside this repository. The user guide shows a minimal Caddy setup.

## Conventions

- Code, identifiers and commit messages are in **English**. The product's labels are in **French**.
- Commit messages follow **Conventional Commits** (`feat(crawler): …`, `fix(web): …`). Keep commits small and focused.
- Prettier and ESLint have the final say on formatting and style. `pnpm lint` must be clean.
- The domain stays pure, with no I/O. A new external dependency enters through a port and an adapter.
- Check labels are **written by us**. Never copy wording from another tool's catalogue.
- Never crawl a third-party site in tests or CI.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the pull-request checklist.

## Licensing

zero-audit is released under the [GNU AGPL-3.0](../LICENSE) (`AGPL-3.0-only`, see [COPYRIGHT](../COPYRIGHT)). Zero Stratégie also sells it under a commercial licence (dual licensing). Keep these points in mind:

- **Contributions require the [CLA](../CLA.md).** Without it, code from outside contributors could not be offered under the commercial licence. The pull-request template has the checkbox.
- **Source offer (section 13).** Every dashboard page has a footer linking to the source code. The link comes from `ZERO_AUDIT_SOURCE_URL`, resolved in `web/src/lib/source.ts`, and defaults to the upstream repository. Do not remove the footer; `web/tests/layout.test.ts` checks it on every screen.
- **No per-file headers.** The `LICENSE` and `COPYRIGHT` files at the root apply to the whole repository.
- **New dependencies must be AGPL-compatible.** Permissive licences (MIT, ISC, BSD, Apache-2.0) are fine. Avoid GPL-incompatible licences, such as some "source-available" ones or the SSPL.

## Third-party licences

Every runtime dependency is under a licence compatible with the AGPL-3.0:

- MIT, ISC, Apache-2.0, BSD-2/3-Clause, BlueOak, CC0 and Python-2.0 (PSF) are all permissive.
- **MPL-2.0** is compatible through its section 3.3, as long as those files are used unmodified.
- **LGPL-3.0** covers the prebuilt `libvips` binary that `sharp` pulls in through Astro. It is dynamically linked and replaceable.

Run `pnpm licenses list --prod` for the full list.
