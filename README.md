# zero-audit

`@zero-strategie/zero-audit-core` is the open-source engine of zero-audit, a technical SEO audit tool. It crawls a website, runs [44 checks](docs/checks.md), scores the site's health and keeps every audit as an immutable snapshot so that you can see what changed between two audits.

It ships as a library and as a command-line tool. A hosted product built on this engine is available at [https://audit.zero-strategie.dev](https://audit.zero-strategie.dev).

- **Crawler**: honours robots.txt and sitemaps, runs breadth-first with a politeness delay, follows redirects and probes URL variants.
- **Checks**: HTTP errors, titles, meta descriptions, headings, thin content and text ratio, internal linking, robots.txt, sitemap, llms.txt, HSTS and duplicate URL variants.
- **Scores**: site health and per-theme scores (crawlability, https, linking, on-page), with the variation since the previous audit.
- **History**: new and fixed issues between two audits, and a `compare` command.
- **Storage**: SQLite out of the box, or Postgres.
- **Queue and worker**: audits can be queued and processed by one or several worker processes.

Only audit sites you own or are allowed to crawl.

## Installation

Requires Node.js 22 or later.

```sh
npm install @zero-strategie/zero-audit-core
```

## Command line

Without installing anything:

```sh
npx @zero-strategie/zero-audit-core https://example.com --direct --json report.json
```

Once the package is installed, it provides a `zero-audit` binary:

```sh
npx zero-audit https://example.com --direct --json report.json
```

`--direct` crawls inside the current process and writes the full snapshot to `report.json`. Without it, `zero-audit https://example.com` puts the audit in a queue and prints its identifier; a worker started with `zero-audit worker` then processes it, and `--wait` waits for the result.

```sh
zero-audit https://example.com --wait          # queue, then wait for a worker
zero-audit worker                              # process queued audits
zero-audit compare <A> <B>                     # compare two completed snapshots
zero-audit migrate --store postgres            # apply storage migrations (needs DATABASE_URL)
```

Run `zero-audit --help` for every option. The messages of the CLI (help, progress and errors) are in French.

## Library

```ts
import { createStorage, createRunAudit, migrateStorage } from '@zero-strategie/zero-audit-core';

const config = { store: 'sqlite', dbPath: './.zero-audit/audit.db', databaseUrl: null } as const;

await migrateStorage(config);
const storage = await createStorage(config);

const runAudit = createRunAudit({
  storage,
  events: { started: () => undefined, finished: () => undefined, failed: () => undefined },
});

const { snapshot } = await runAudit.execute({
  rootUrl: 'https://example.com',
  limit: 100,
  delayMs: 1000,
});
console.log(snapshot.id, snapshot.pagesCrawled);

await storage.close();
```

`createRunAudit` refuses private network addresses by default (SSRF guard). The package also exports the use cases, ports, checks and scoring functions; the exported names are listed in `src/index.ts`.

## Documentation

- [User guide](docs/user-guide.md): install, run audits, read scores, storage.
- [Checks reference](docs/checks.md): what each check flags and how to fix it.
- [Developer guide](docs/developer-guide.md): architecture, adding a check, storage, tests, CI.
- [Contributing](CONTRIBUTING.md)

## About

zero-audit is built by [Zero Stratégie](https://zero-strategie.dev). Its feature set is inspired by commercial site-audit tools such as Semrush's Site Audit, and the numeric identifiers of its checks follow the numbering used by Semrush's Site Audit, so that results can be compared. It is an independent project, not affiliated with or endorsed by Semrush. Zero Stratégie has no link with Ahrefs or Screaming Frog either. The check wording is original.

## Licence

zero-audit is free software, released under the [GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`).

You can use it freely, including inside a company, and you can modify it. If you offer a modified version to users over a network, for example as a hosted service, you must make your modified source code available to them under the same licence.

Copyright © 2026 Zero Stratégie. See [COPYRIGHT](COPYRIGHT).

## Commercial licence

To embed zero-audit in a proprietary product, or to host a modified version without publishing your changes, a commercial licence is available from [Zero Stratégie](https://zero-strategie.dev). Contributions are accepted under the [CLA](CLA.md), which keeps this dual licensing possible.
