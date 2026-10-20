# User guide

zero-audit is a technical SEO audit tool. It crawls a website the way a search engine would, runs [20 checks](checks.md) on what it finds, gives the site a health score, and tracks how it changes from one audit to the next.

It has three parts:

- a **command line** (`zero-audit`) that runs audits and compares them;
- a read-only **HTTP API** (`zero-audit serve`);
- a **web dashboard** that reads the API.

Every audit is stored as an immutable **snapshot**, in SQLite (the default) or in Postgres.

- [Install](#install)
- [Run your first audit](#run-your-first-audit)
- [Read the results](#read-the-results)
- [Compare two audits](#compare-two-audits)
- [Use the dashboard](#use-the-dashboard)
- [Store audits in Postgres](#store-audits-in-postgres)
- [Run with Docker](#run-with-docker)
- [Self-host it](#self-host-it)
- [Command reference](#command-reference)
- [Limitations](#limitations)
- [FAQ](#faq)

## Install

You need **Node.js 22** and **pnpm**. Docker is optional; see [Run with Docker](#run-with-docker).

```sh
git clone https://github.com/zero-strategie/zero-audit.git
cd zero-audit
pnpm install
```

## Run your first audit

```sh
pnpm zero-audit https://example.com
```

zero-audit starts from the URL you give it:

1. It reads `robots.txt`, then the sitemaps.
2. It follows internal links breadth-first, up to 100 pages by default, waiting one second between two requests.
3. It probes URL variants (trailing slash, `www.`).
4. It runs the checks and stores the snapshot in `./.zero-audit/audit.db`.

The progress (`8/100`) goes to stderr. When the crawl is over, the summary goes to stdout:

```text
Audit 9abf37ed-… (finished)
Pages explorées : 8 / 100

Scores
  Santé du site : 74 (0)
  crawlability : 88 (0)
  https : non calculable
  linking : 100 (0)
  on-page : 63 (0)
  ...
Checks déclenchés
  6 – Même titre utilisé sur plusieurs pages – 2 / 8 – Δ 0 – nouvelles 0 – corrigées 0
  ...
```

The interface is in French.

Useful options:

```sh
pnpm zero-audit https://example.com --limit 500       # crawl up to 500 pages
pnpm zero-audit https://example.com --delay 250       # be faster, on your own site only
pnpm zero-audit https://example.com --json audit.json # also export the full snapshot
```

> **Be polite.** Only audit sites you own or are allowed to crawl. zero-audit:
> - honours `robots.txt`;
> - identifies itself as `ZeroAuditBot/<version> (+https://zero-strategie.dev)`;
> - waits between requests.
>
> Keep the default delay on sites you do not control.

## Read the results

### Scores

Every check reports two numbers:

- `count`: how many problems it found;
- `examined`: how many items it looked at.

Its **pass rate** is `1 − min(1, count / examined)`.

- **Site health** (0–100) is the average of the pass rates, weighted by severity: an error weighs 3, a warning 1 and a notice 0. Notices are reported but never lower the score. Checks that examined nothing are left out.
- **Theme scores** use the same formula, restricted to the checks of one theme: crawlability, https, linking, on-page and other. A score is *not computable* when no weighted check of the theme examined anything.
- The number in brackets is the **variation** since the previous finished audit of the same site: `74 (+3)`, `74 (−2)`, `74 (0)`. Scores are rounded first, so the figures always add up.

Scores are computed when they are read, not stored. Changing the weights recomputes all past scores.

### Severities

| Severity | Meaning |
|---|---|
| Error (Erreur) | Directly hurts indexing or users. Fix first. |
| Warning (Avertissement) | Weakens the page. Fix when you can. |
| Notice | Worth knowing. Does not affect the score. |

See the [checks reference](checks.md) for what each check flags and how to fix it.

### Deltas: new and fixed

For each check, an audit is compared with the **previous finished audit of the same site** (a project). Problems are matched by check, page and details.

- **Δ** is the change in count.
- **nouvelles** (new) counts problems that were not there before.
- **corrigées** (fixed) counts problems that have disappeared.

The first audit of a site has no previous audit, so every problem is new.

Two audits of an unchanged site give Δ 0, 0 new and 0 fixed.

### Page groups

Each crawled page falls into exactly one group. When a page matches several groups, the first one in this order wins:

1. **Blocked**: forbidden by robots.txt, so it is recorded but never requested.
2. **Broken**: a 4xx or 5xx answer, or a network error.
3. **Redirect**: a 3xx answer.
4. **Have issues**: at least one error or warning on the page. Notices do not count.
5. **Healthy**: none of the above.

### Projects

A project groups the audits of one start URL, normalised. `https://example.com` and `https://www.example.com` are two projects, as are the `http` and `https` versions of a site.

## Compare two audits

```sh
pnpm zero-audit compare <A> <B>
```

`A` is the base and `B` the target. Use the snapshot ids printed by the audit summary. The output shows, for each check:

- the counts in A and in B;
- the delta;
- the new and fixed occurrences, then their details.

Both audits must be finished and belong to the same site.

## Use the dashboard

The dashboard is a separate web server that reads the API. Run each command in its own terminal:

```sh
pnpm zero-audit serve                  # API on http://127.0.0.1:3000
pnpm --filter web dev                  # dashboard on http://127.0.0.1:4321
```

For a production build of the dashboard, run `pnpm --filter web build`, then `pnpm --filter web start`.

| Screen | What it shows |
|---|---|
| Projects | Every audited site, with its latest health score and date. |
| Overview | Health gauge, theme cards, counts per severity, page groups, top 5 issues, status of robots.txt, sitemap and llms.txt. An audit selector opens older audits. |
| Issues | All checks grouped by severity, passed ones included, with an optional severity filter. |
| Issue detail | The occurrences of one check, paginated. |
| Crawled pages | Every page with its status, depth, group, issue count and response time. Sortable and paginated. |
| Compare | Pick two audits of the same site and see scores and differences side by side. |

The dashboard works on mobile and follows your system's dark mode.

## Store audits in Postgres

SQLite needs no setup. To share audits between machines, or to run in production, use Postgres:

```sh
POSTGRES_PASSWORD=change-me docker compose up -d postgres
export DATABASE_URL=postgresql://zero_audit:change-me@127.0.0.1:5432/zero_audit
pnpm zero-audit migrate --store postgres
pnpm zero-audit https://example.com --store postgres
pnpm zero-audit serve --store postgres
```

You can set `ZERO_AUDIT_STORE=postgres` instead of passing `--store` every time. The schema is migrated automatically on first use. `migrate` only exists so a deployment can apply migrations explicitly.

## Run with Docker

The repository builds two images:

- `api`: the CLI, the API and the migrations;
- `web`: the dashboard.

The `docker-compose.yml` starts the whole stack (Postgres, migrations, API and dashboard), publishing ports on `127.0.0.1` only:

```sh
POSTGRES_PASSWORD=change-me docker compose up --build
# dashboard: http://127.0.0.1:4321    API: http://127.0.0.1:3000
docker compose run --rm migrate audit https://example.com   # run an audit in the stack
```

The `migrate` service is built from the `api` image and its command is replaced, so it can run any CLI command against the stack's Postgres. Published images are available as `ghcr.io/zero-strategie/zero-audit-api` and `ghcr.io/zero-strategie/zero-audit-web`.

## Self-host it

zero-audit has **no authentication** of its own. The API and the dashboard must only be published on `127.0.0.1`, behind a reverse proxy that adds TLS and authentication. In Docker, publish them as `127.0.0.1:3000:3000`, never as `3000:3000`.

With [Caddy](https://caddyserver.com), for example:

```caddyfile
audit.example.com {
	# Health checks stay public, so deployment scripts can probe them.
	handle /health {
		reverse_proxy 127.0.0.1:4321
	}
	handle {
		basic_auth {
			admin <bcrypt hash from `caddy hash-password`>
		}
		reverse_proxy 127.0.0.1:4321
	}
}
```

Only expose the dashboard. It calls the API from the server side, so the API never needs to be reachable from outside.

To audit the site on a schedule, run `zero-audit <url>` from cron or a systemd timer, for example `docker compose run --rm migrate audit https://example.com`. The dashboard then shows the trend.

Both servers answer `GET /health`:

- `200 {"status":"ok"}` when healthy;
- `503 {"status":"unavailable"}` otherwise.

For the API, healthy means the database answers. For the dashboard, it means the API answers.

```sh
curl http://127.0.0.1:3000/health   # API
curl http://127.0.0.1:4321/health   # dashboard (reflects the API health)
```

Each audit writes JSON lines to stdout (`audit.started`, `audit.finished` with the health score, `audit.failed`), handy for `docker logs` and log collectors.

## Command reference

```text
zero-audit [audit] <url> [options]   run an audit (the word "audit" is optional)
zero-audit compare <A> <B>           compare two finished audits of the same site
zero-audit serve                     start the read-only HTTP API
zero-audit migrate                   apply storage migrations and exit
```

An option takes precedence over its environment variable, which takes precedence over the default.

| Option | Environment variable | Default | Meaning |
|---|---|---|---|
| `--limit <n>` | | 100 | maximum number of pages crawled |
| `--delay <ms>` | `ZERO_AUDIT_DELAY_MS` | 1000 | delay between two requests |
| `--db <path>` | `ZERO_AUDIT_DB_PATH` | `./.zero-audit/audit.db` | SQLite database file |
| `--store <sqlite\|postgres>` | `ZERO_AUDIT_STORE` | `sqlite` | storage backend |
| | `DATABASE_URL` | | Postgres URL, required with `--store postgres` |
| `--json <file>` | | | export the full snapshot as JSON |
| `--port <n>` | `PORT` | 3000 | API port (`serve`) |
| | `HOST` | `127.0.0.1` | listening address (`serve`, dashboard). Use `0.0.0.0` only inside a container. |
| | `ZERO_AUDIT_API_URL` | `http://127.0.0.1:3000` | API address used by the dashboard |
| `--help` | | | print the usage |

| Exit code | Meaning |
|---:|---|
| 0 | success |
| 1 | the audit failed (the snapshot is marked `failed`); unknown or unfinished snapshot in `compare` |
| 2 | invalid usage; nothing was requested or stored |
| 130 / 143 | interrupted by Ctrl+C or `SIGTERM` (an audit in progress is marked `failed`) |

`.env.example` lists every variable.

## Limitations

- **No JavaScript rendering.** Pages are analysed as served by the server. Content injected by client-side JavaScript is not seen.
- **Single user.** There are no accounts. Protect the deployment with your reverse proxy.
- **Read-only dashboard.** Audits are started from the command line or a scheduler, not from the UI.
- **No performance metrics** such as Core Web Vitals or Lighthouse yet. Response times are measured but not scored.
- **One site per project.** Subdomains are not crawled. Only `www.` and the apex domain are probed, for check 1000.

## FAQ

**Why does my score differ from another SEO tool's?**
Tools crawl different sets of URLs and define some checks differently. For example, they may count `robots.txt` as a page, or merge URL variants. The [checks reference](checks.md) documents our definitions.

**Why is a theme "non calculable"?**
None of its weighted checks examined anything. For example, the `https` theme only has a notice for now.

**Can I audit a site I don't own?**
Technically yes, but only do it with permission, and keep the default delay.

**Where is my data?**
In `./.zero-audit/audit.db` (SQLite) or in your Postgres database. Nothing is sent anywhere else.
