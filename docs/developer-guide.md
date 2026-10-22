# Developer guide

This guide explains how the zero-audit core is built, how to use it as a library, how to run its tests, and how to extend and publish it. To use the command line, see the [user guide](user-guide.md).

- [Setup](#setup)
- [Repository layout](#repository-layout)
- [Architecture](#architecture)
- [Using the library](#using-the-library)
- [Data model](#data-model)
- [Legacy tables](#legacy-tables)
- [Add a check](#add-a-check)
- [Writing a storage adapter](#writing-a-storage-adapter)
- [SSRF guard](#ssrf-guard)
- [Worker and queue](#worker-and-queue)
- [Testing](#testing)
- [Publishing](#publishing)
- [Conventions](#conventions)
- [Licensing](#licensing)
- [Third-party licences](#third-party-licences)

## Setup

You need **Node.js 22** and **pnpm** (the version is pinned in `package.json`).

```sh
pnpm install
pnpm lint        # ESLint (typescript-eslint strict)
pnpm typecheck   # tsc --noEmit
pnpm test        # Vitest
pnpm format      # Prettier
pnpm build       # compiles the library and the CLI to dist/
```

Run a single test file with `pnpm vitest run tests/domain/scoring.test.ts`. The full suite, with the Postgres tests, is described in [Testing](#testing).

The stack:

- TypeScript (strict, ESM);
- [undici](https://undici.nodejs.org) for HTTP, [cheerio](https://cheerio.js.org) for HTML, [robots-parser](https://github.com/samclarke/robots-parser), [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) for sitemaps;
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) and [pg](https://node-postgres.com) for storage.

## Repository layout

```text
src/
  index.ts         the public surface of the library: every export is named explicitly
  domain/          pure logic, no I/O: crawl model, checks, scoring, diffing, page groups
    checks/page/   checks that examine pages one by one
    checks/site/   checks that examine the site as a whole
  application/     use cases (RunAudit, QueueAudit, CompareSnapshots, ListPages…) and ports/
  infrastructure/  adapters: undici, cheerio, robots-parser, sqlite/, postgres/, clock…
  composition/     wiring of real adapters: createStorage, createRunAudit, createAuditWorker
  cli/             command-line adapter (argument parsing, rendering)
tests/             mirrors src/, plus support/ (fixture server, contract suites)
docs/              user guide, developer guide, checks reference
```

## Architecture

zero-audit follows a hexagonal architecture.

- The **domain** knows nothing about HTTP, HTML parsing or databases.
- The **application** layer orchestrates use cases through **ports**: the interfaces in `src/application/ports/`.
- **Adapters** in `infrastructure/` and `cli/` implement or drive those ports.

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

`CompareSnapshots`, `GetSnapshotReport`, `ListIssues`, `ListOccurrences`, `ListPages` and `ListProjects` are the read-side use cases. The CLI and the library consumers use them.

## Using the library

Install the package (see [Publishing](#publishing) for how to get it before it is on npm) and import from the package root. Only what `src/index.ts` exports is public.

### Open a storage

`createStorage` opens SQLite or Postgres, migrating it first, and returns the repositories the use cases need.

```ts
import { createStorage } from '@zero-strategie/zero-audit-core';

const storage = await createStorage({
  store: 'postgres', // or 'sqlite'
  databaseUrl: process.env['DATABASE_URL'] ?? null, // only read for 'postgres'
  dbPath: './.zero-audit/audit.db', // only read for 'sqlite'
});
// storage.projects, storage.snapshots, storage.queue, storage.health
await storage.close(); // idempotent
```

`storage.connection` exposes the underlying connection: `{ kind: 'sqlite', db }` (a `better-sqlite3` database) or `{ kind: 'postgres', pool }` (a `pg` pool). A product built on the core uses it to attach its own repositories to the same database, without opening a second connection.

```ts
const { connection } = storage;
if (connection.kind === 'postgres') {
  const accounts = new MyAccountRepository(connection.pool); // your code, your tables
}
```

The core keeps the tables of accounts created by its historical migrations (`users`, `sessions`, `email_tokens`, `api_launches`). The core does not manage accounts, but it journals launches in `api_launches` for the admission rules. Migrations are never edited, so these tables stay.

### Queue an audit

Check the target first, then queue. `AssertPublicTarget` is the fast SSRF pre-check: it throws `InvalidAuditUrl` or `PrivateAddressRejected` when the URL is invalid or resolves to a non-public address. It has no switch; a caller that does not want it does not call it.

```ts
import { AssertPublicTarget, DnsHostResolver, QueueAudit } from '@zero-strategie/zero-audit-core';
import type { Clock } from '@zero-strategie/zero-audit-core';

const clock: Clock = { now: () => Date.now() };

await new AssertPublicTarget(new DnsHostResolver()).execute(url);
const queued = await new QueueAudit(storage.queue, storage.projects, clock).execute({
  url,
  limit: 100,
});
// queued.snapshotId, queued.projectId, queued.position
```

`QueueAudit` is the command-line launch: no owner, no quota. To enforce your own rules, call `storage.queue.enqueue(input, admit)` where `admit` receives an `AdmissionView` (counters over the launch journal) and throws to refuse. It runs inside the transaction that records the audit, so two concurrent requests cannot both pass the same limit.

The guard at connection time (`blockPrivateAddresses`) stays the authority; see [SSRF guard](#ssrf-guard).

### Run audits and read results

- `createAuditWorker({ storage, logger, delayMs, concurrency })` builds the loop that claims queued audits (`ProcessAuditQueue`). The SSRF guard is on unless you pass `allowPrivateTargets: true`.
- `createRunAudit({ storage, events })` builds a `RunAudit` that crawls in the calling process, outside the queue.
- The read side is `GetSnapshotReport`, `CompareSnapshots`, `ListIssues`, `ListOccurrences`, `ListPages`, `ListProjects`, `ListProjectSnapshots` and `GetAuditProgress`.
- `runCli(argv, env, io, hooks)` runs the command line from your own program.

### Reader: a neutral visibility filter

The read use cases take a `Reader`, either `ANONYMOUS_READER` or `{ kind: 'account', userId, isAdmin }`. It only filters visibility: a project with no owner (the showcase) is visible to everyone, any other project to the owner whose `ownerId` equals `userId`. `userId` is a free-form identifier that the core compares and gives no other meaning. `isAdmin` has no effect on visibility: an administrator sees their own projects and the showcase only. Any wider rule belongs to your product.

```ts
import { ANONYMOUS_READER, ListProjects } from '@zero-strategie/zero-audit-core';

const overview = new ListProjects(storage.projects, storage.snapshots);
const mine = await overview.execute({ kind: 'account', userId: 'owner-1', isAdmin: false });
const showcase = await overview.execute(ANONYMOUS_READER);
```

## Data model

| Table | Content |
|---|---|
| `projects` | one row per normalised start URL |
| `snapshots` | one audit: project, status (`queued`, `running`, `finished`, `failed`), start and end dates, pages crawled, limit, plus the queue columns `queued_at`, `attempts` and the worker heartbeat |
| `pages` | crawled and blocked pages: URL, depth, status, headers, response time, content type, title, meta description, canonical, h1, word count, text ratio, error |
| `links` | links found on each page: source, target, type, `rel`, anchor text |
| `site_files` | `robots.txt`, sitemaps, `llms.txt`: URL, status, error |
| `host_probes`, `slash_probes` | URL-variant probes (check 1000) |
| `check_results` | per check: severity, theme, `count`, `examined` |
| `issue_occurrences` | per occurrence: check, page URL, `info` (JSON) |

The domain types are in `src/domain/crawl.ts`, `snapshot.ts`, `project.ts` and `check.ts`.

## Legacy tables

The core migrations still create tables and columns that belong to accounts, because the hosted product built on the core uses them. The core does not manage accounts. These objects are created by the core migrations, used by the hosted product, and never dropped: migrations are never edited.

| Object | Role |
|---|---|
| `users` | accounts of the hosted product |
| `sessions` | login sessions of those accounts |
| `email_tokens` | single-use tokens sent by e-mail (confirmation, reset) |
| `api_launches` | journal of attributed launches, keyed by a hash of the e-mail address; the admission rules count it |
| `projects.owner_id` | owner of a project; `NULL` for the showcase, read through `Reader` |
| `snapshots.launched_by` | account that launched an audit; `NULL` for the command line |

The core itself only writes `api_launches` (through `AuditQueue.enqueue`, when a launch has an owner) and reads `owner_id` for visibility. Do not document these tables inside the `.sql` files: a test forbids touching them.

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

Nothing else is needed: the CLI and the library list checks from the registry (`allChecks`).

## Writing a storage adapter

An adapter for another database implements the ports in `src/application/ports/`:

- `ProjectRepository` (`project-repository.ts`);
- `SnapshotRepository` (`snapshot-repository.ts`), the audit data;
- `AuditQueue` (`audit-queue.ts`), the queue, the launch journal and the worker presence;
- `StorageHealth` (`storage-health.ts`), a `ping()`;
- `StorageMigrator` (`storage-migrator.ts`), applied by `MigrateStorage`.

Ready-made implementations to follow: in-memory (unit tests, `SnapshotRepository` and `ProjectRepository` only), SQLite (`src/infrastructure/sqlite/`) and Postgres (`src/infrastructure/postgres/`).

All of them must pass the **same contract suites** in `tests/support/`: `project-repository-contract.ts` (`describeProjectRepositoryContract`) and `snapshot-repository-contract.ts` (`describeSnapshotRepositoryContract`). Call them from a test file with a factory that returns a fresh, empty repository. The suites cover:

- immutability of finished snapshots;
- atomicity;
- ordering;
- the previous-snapshot lookup;
- the read-back of every stored field;
- the queue: claiming, attempts, recovery and the admission transaction.

The SQLite and Postgres adapters must pass them **without any skip**: the Postgres run needs `TEST_DATABASE_URL` (see [Testing](#testing)), and a skipped test counts as a failure. Add a test to the contract suite rather than to one adapter.

Migrations are versioned SQL files, applied in order and recorded in the database:

- `src/infrastructure/sqlite/migrations/NNN_name.sql`;
- `src/infrastructure/postgres/migrations/NNN_name.sql`.

Postgres migrations are serialised by an advisory lock. Opening a storage migrates it automatically, and `zero-audit migrate` does it explicitly.

Migrations are **additive**: never edit, rename or delete one that has shipped. Add a new file to **both** folders. The numbering differs between the two, because Postgres started with a consolidated `001_init.sql`.

`createStorage` (`src/composition/storage.ts`) picks the adapter from `--store` or `ZERO_AUDIT_STORE`, plus `DATABASE_URL`; register a new adapter there.

## SSRF guard

A hosted product crawls any public site on request, so its HTTP client must never reach an internal service such as the database. `UndiciHttpClient` enforces this when built with `blockPrivateAddresses: true`; `createRunAudit` enables it by default, and audits queued by the CLI go through the worker's guard.

- **Refused ranges** (`src/domain/network-address.ts`, `isPublicAddress`): `0.0.0.0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16`, `172.16/12`, `192.168/16`, `224/4` and `240/4` (including `255.255.255.255`), plus `::`, `::1`, `fc00::/7`, `fe80::/10` and every IPv4-mapped address (`::ffff:0:0/96`).
- **Name resolution**: the undici agent has a custom `connect.lookup`. It keeps only public addresses and fails if none is left, so a host with one internal and one public address is still reachable on the public one. Node 22 calls `lookup` with `all: true` (autoSelectFamily), others with the simple form; both are handled. Checking at connection time also covers DNS rebinding and every redirect hop, because redirects are not followed by the client: each hop is a new request.
- **Literal IPs**: `lookup` is not called for an IP in the URL, so `get` checks `new URL(url).hostname` before `fetch` (`new URL` already normalises forms such as `0x7f.1` to `127.0.0.1`).
- **`blocked`**: a refused request is a `NetworkFailure` of kind `blocked`. The crawler records it like any other network error; if the root itself is blocked the audit fails with `RootUnreachable`.
- **`ZERO_AUDIT_ALLOW_PRIVATE_TARGETS`**: read by `worker`. The exact value `true` turns the guard off (`allowPrivateTargets`); `TRUE`, `1` or `yes` do not.
- **Pre-check**: `AssertPublicTarget` (see [Using the library](#using-the-library)) fails fast before queueing. It does not replace the guard at connection time.

## Worker and queue

`QueueAudit` never crawls: it inserts a `queued` snapshot through `AuditQueue.enqueue` and returns its position. A worker (`ProcessAuditQueue`) claims the audits one by one (`claimNext`, safe against concurrent workers) in the order of `queued_at`. The queue lives in the `snapshots` table: no Redis, no extra dependency.

- **Admission**: the `admit` callback of `enqueue` runs inside the transaction of the insert, serialised by `pg_advisory_xact_lock` (Postgres) or `BEGIN IMMEDIATE` (SQLite). The command line passes a callback that always accepts.
- **`zero-audit worker`**: dedicated process; `ZERO_AUDIT_WORKER_CONCURRENCY` (default 1) audits in parallel. Its identity is `os.hostname()` (suffixed when concurrency is above 1). `SIGTERM` or `SIGINT` puts the running audit back in the queue and exits 0.
- **`zero-audit worker-health`**: exits 0 if the worker of this host signalled itself less than 60 s ago, else 1. The worker has its own presence heartbeat every 15 s, independent of the pages crawled.
- **CLI**: `zero-audit <url>` queues the audit and prints its id and position. `--wait` follows it until the end and prints the summary (a warning appears if no worker is active; the wait is otherwise unbounded). `--direct` crawls in the process, outside the queue (`--wait` and `--direct` are exclusive).
- **Progress**: `GetAuditProgress` reads everything from the database: status, `pagesCrawled` (last heartbeat), `pagesLimit`, `queuePosition` and `attempts`.

### Recovery and failure

- **Orphans**: `RecoverStaleAudits` (worker loop) puts back in the queue every `running` audit whose heartbeat is older than 2 minutes, keeping its original `queued_at` (so it is resumed first). The audit restarts from zero.
- **Two attempts at most**: after the second interruption the audit is marked `failed`. `heartbeat`, `finishAttempt` and `failAttempt` are conditional on `status = 'running' AND attempts = <claimed attempt>`: a refused write throws `AuditAttemptLost` and the worker abandons the attempt.
- **Legacy audits** without a heartbeat (`--direct`, rows older than the migration) are marked `failed` once they are 6 hours old (`LEGACY_ORPHAN_AGE_MS`), never earlier.
- **Shutdown**: give a worker process a grace period of at least 30 s so that it can put its audit back in the queue before `SIGKILL`. After a `kill -9` the heartbeat expires after 2 minutes and the audit is recovered anyway.
- **Exception to append-only**: finished snapshots stay immutable, but `requeue` and `recoverStale` delete the child rows (pages, links, issues) of an interrupted attempt so that the restart begins clean.

## Testing

- **TDD.** Write the failing test first, watch it fail, then make it pass.
- **No test may reach the Internet.** `tests/support/network-guard.setup.ts` installs an undici `MockAgent` that refuses every host but `127.0.0.1` and `localhost`. Production code must use undici's global dispatcher so the guard applies.
- **Crawl against a local fixture server.** `tests/support/fixture-server.ts` starts a `node:http` server from a map of routes to responses. Use it for anything that goes through HTTP.
- **Postgres tests** run when `TEST_DATABASE_URL` is set and are skipped otherwise, but a change is only verified when none is skipped. CI provides a Postgres 16 service and fails if tests are skipped. Locally, point the variable at a throwaway database (the tests create and drop data freely) and run the whole suite:

  ```sh
  TEST_DATABASE_URL=postgresql://zero_audit@127.0.0.1:55432/zero_audit_test pnpm test
  ```

  The output must not contain `skipped`. The compose file at the root starts a local Postgres 16 for development if you have no instance.
- **Packaging and workflows** (`.github/workflows/`, the npm package contents) have static tests in `tests/deploy/`, and `pnpm pack:check` and `pnpm pack:smoke` verify the tarball.

## Publishing

The package is `@zero-strategie/zero-audit-core`, with the binary `zero-audit`. `.github/workflows/release.yml` publishes it to npm with provenance when a version tag is pushed; `scripts/check-release-version.ts` refuses a tag that does not match the `version` of `package.json`.

Prerequisites, none of which the repository can provide:

- **The npm organisation `@zero-strategie`** must exist and the publishing account must belong to it.
- **The secret `NPM_TOKEN`** must be set in the GitHub repository (an automation token able to publish in that organisation).
- **The repository must be public.** npm provenance (`--provenance`) is refused for a package built from a private repository, so the release fails while the repository is private. Do not remove `--provenance` to work around it.

To release: bump `version` in `package.json`, merge, then push the tag `vX.Y.Z`. Check the contents first with `pnpm build && pnpm pack:check`.

Until the package is on npm, consume the core from a tarball or from git:

- **Tarball**: `pnpm build && pnpm pack` produces `zero-strategie-zero-audit-core-<version>.tgz`; install it with `pnpm add ./zero-strategie-zero-audit-core-<version>.tgz`.
- **Git**: `pnpm add git+ssh://git@github.com/zero-strategie/zero-audit.git#<tag-or-sha>`. The package is built by `prepublishOnly`, which git installs do not run, so prefer the tarball unless you build `dist/` yourself.

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
- **No per-file headers.** The `LICENSE` and `COPYRIGHT` files at the root apply to the whole repository.
- **New dependencies must be AGPL-compatible.** Permissive licences (MIT, ISC, BSD, Apache-2.0) are fine. Avoid GPL-incompatible licences, such as some "source-available" ones or the SSPL.

## Third-party licences

Every runtime dependency is under a licence compatible with the AGPL-3.0:

- MIT, ISC, Apache-2.0, BSD-2/3-Clause, BlueOak, CC0 and Python-2.0 (PSF) are all permissive.
- **MPL-2.0** is compatible through its section 3.3, as long as those files are used unmodified.

Run `pnpm licenses list --prod` for the full list.