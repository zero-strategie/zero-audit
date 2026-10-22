# User guide

zero-audit is a technical SEO audit tool. It crawls a website the way a search engine would, runs [29 checks](checks.md) on what it finds, gives the site a health score, and tracks how it changes from one audit to the next.

You use it through its **command line**, `zero-audit`. Every audit is stored as an immutable **snapshot**, in SQLite (the default) or in Postgres.

- [Install](#install)
- [Run your first audit](#run-your-first-audit)
- [Read the results](#read-the-results)
- [Commands](#commands)
- [Store audits in Postgres](#store-audits-in-postgres)
- [Environment variables](#environment-variables)
- [Exit codes](#exit-codes)
- [Limitations](#limitations)
- [FAQ](#faq)

## Install

You need **Node.js 22**. Run it without installing anything:

```sh
npx @zero-strategie/zero-audit-core https://example.com
```

Or install it, which provides the `zero-audit` binary:

```sh
npm install @zero-strategie/zero-audit-core
npx zero-audit https://example.com
```

From a clone of the repository (uses **pnpm**):

```sh
pnpm install
pnpm zero-audit https://example.com
```

The examples below write `zero-audit`; prefix it with `npx` or `pnpm` as needed.

**Language.** The messages of the CLI (summary, errors, usage) are in French. Identifiers, check numbers and this guide are in English.

## Run your first audit

```sh
zero-audit https://example.com --direct
```

`--direct` crawls in the current process. Without it, the audit is only queued for a worker (see [`audit`](#audit)).

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

The messages are in French.

Useful options:

```sh
zero-audit https://example.com --limit 500       # crawl up to 500 pages
zero-audit https://example.com --delay 250       # be faster, on your own site only
zero-audit https://example.com --json audit.json # also export the full snapshot
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

To see what changed between two audits, use [`compare`](#compare).

## Commands

Run `zero-audit --help` for the usage. The word `audit` is optional: `zero-audit <url>` is the same as `zero-audit audit <url>`.

### audit

```sh
zero-audit audit <url> [--limit <n>] [--delay <ms>] [--wait | --direct] [--json <file>]
```

Audits a site, starting from an `http` or `https` URL.

- By default the audit is **queued** and the command prints its id and its position. A [`worker`](#worker) then processes it.
- `--wait` waits for the end of the audit and prints the summary. It warns when no worker is active, and cannot be combined with `--direct`.
- `--direct` crawls in the current process, without the queue or a worker.
- `--json <file>` also writes the full snapshot as JSON (with `--wait` or `--direct`).

```sh
zero-audit https://example.com --wait --limit 200
zero-audit https://example.com --direct --json audit.json
```

### compare

```sh
zero-audit compare <A> <B>
```

`A` is the base and `B` the target. Use the snapshot ids printed by the audit summary. The output shows, for each check:

- the counts in A and in B;
- the delta;
- the new and fixed occurrences, then their details.

Both audits must be finished and belong to the same site.

```sh
zero-audit compare 9abf37ed-0000-0000-0000-000000000001 3c1d52aa-0000-0000-0000-000000000002
```

### migrate

```sh
zero-audit migrate [--store <type>] [--db <path>]
```

Applies the storage migrations, then exits. Other commands migrate automatically on first use; `migrate` lets a deployment do it explicitly.

```sh
zero-audit migrate --store postgres
```

### worker

```sh
zero-audit worker [--store <type>] [--db <path>]
```

A dedicated process that takes the queued audits and crawls them. `ZERO_AUDIT_WORKER_CONCURRENCY` sets how many run in parallel. On `SIGTERM` or `SIGINT` the audit in progress goes back to the queue and the worker exits with 0. An audit interrupted twice ends as failed.

```sh
ZERO_AUDIT_WORKER_CONCURRENCY=2 zero-audit worker
```

By default the worker refuses targets that are, or resolve to, internal addresses (loopback, private networks, link-local). Set `ZERO_AUDIT_ALLOW_PRIVATE_TARGETS=true` to lift that guard, on a development machine only.

### worker-health

```sh
zero-audit worker-health [--store <type>] [--db <path>]
```

Exits 0 if the worker of this host reported itself less than 60 seconds ago, otherwise 1. Useful as a health probe.

```sh
zero-audit worker-health && echo "worker alive"
```

### Options

An option takes precedence over its environment variable, which takes precedence over the default.

| Option | Environment variable | Default | Meaning |
|---|---|---|---|
| `--limit <n>` | | 100 | maximum number of pages crawled |
| `--delay <ms>` | `ZERO_AUDIT_DELAY_MS` | 1000 | delay between two requests |
| `--db <path>` | `ZERO_AUDIT_DB_PATH` | `./.zero-audit/audit.db` | SQLite database file |
| `--store <sqlite\|postgres>` | `ZERO_AUDIT_STORE` | `sqlite` | storage backend |
| `--json <file>` | | | export the full snapshot as JSON |
| `--wait` | | | wait for the queued audit to end |
| `--direct` | | | crawl in the process, outside the queue |
| `--help` | | | print the usage |

## Store audits in Postgres

SQLite needs no setup. To share audits between machines, use Postgres:

```sh
export DATABASE_URL=postgresql://zero_audit:change-me@127.0.0.1:5432/zero_audit
zero-audit migrate --store postgres
zero-audit https://example.com --store postgres --wait
```

You can set `ZERO_AUDIT_STORE=postgres` instead of passing `--store` every time. The repository ships a compose file with a single Postgres service for local development; it reads `POSTGRES_PASSWORD`.

## Environment variables

`.env.example` lists every variable.

| Variable | Default | Meaning |
|---|---|---|
| `ZERO_AUDIT_STORE` | `sqlite` | storage backend, `sqlite` or `postgres`; `--store` wins |
| `ZERO_AUDIT_DB_PATH` | `./.zero-audit/audit.db` | SQLite database file; the folder is created on first run |
| `DATABASE_URL` | | Postgres connection URL, required with the `postgres` store |
| `POSTGRES_PASSWORD` | `change-me` | password of the local development Postgres; use the same one in `DATABASE_URL` |
| `ZERO_AUDIT_DELAY_MS` | `1000` | delay in milliseconds between two requests (`audit`, `worker`) |
| `ZERO_AUDIT_ALLOW_PRIVATE_TARGETS` | unset | exact value `true` lets `worker` crawl internal addresses; development only |
| `ZERO_AUDIT_WORKER_CONCURRENCY` | `1` | audits `worker` runs in parallel (positive integer) |
| `TEST_DATABASE_URL` | unset | Postgres tests run only when set; point it at a throwaway database, never at `DATABASE_URL` |

## Exit codes

| Exit code | Meaning |
|---:|---|
| 0 | success; also a `worker` stopped cleanly by a signal |
| 1 | the audit failed (the snapshot is marked `failed`); unknown or unfinished snapshot in `compare`; `worker-health` found no live worker |
| 2 | invalid usage; nothing was requested or stored |
| 130 | interrupted by Ctrl+C (`SIGINT`) with `--direct`: the audit in progress is marked `failed` |
| 143 | stopped by `SIGTERM` with `--direct`: the audit in progress is marked `failed` |

## Limitations

- **No JavaScript rendering.** Pages are analysed as served by the server. Content injected by client-side JavaScript is not seen.
- **Queue.** Audits wait in a queue and a worker crawls them; use `--direct` to skip it.
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
