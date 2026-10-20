# zero-audit

Open-source technical SEO audit tool. zero-audit crawls a website, runs [20 checks](docs/checks.md), scores the site's health and tracks every change between two audits. You can use it from the command line, through a read-only HTTP API, or in a web dashboard.

- **Crawler**:
  - honours robots.txt and sitemaps;
  - runs breadth-first with a politeness delay;
  - follows redirects;
  - probes URL variants.
- **Checks**:
  - HTTP errors;
  - titles, meta descriptions, headings;
  - thin content and text ratio;
  - internal linking;
  - robots.txt, sitemap, llms.txt, HSTS;
  - duplicate URL variants.
- **Scores**:
  - site health and per-theme scores (crawlability, https, linking, on-page);
  - variation since the previous audit.
- **History**: every audit is an immutable snapshot, with new and fixed issues and a `compare` command.
- **Storage**: SQLite out of the box, or Postgres.
- **Dashboard**: built with Astro, responsive, with a dark mode. The interface is in French.

## Quick start

Requires Node.js 22 and pnpm.

```sh
pnpm install
pnpm zero-audit https://example.com          # run an audit
pnpm zero-audit serve                        # API on http://127.0.0.1:3000
pnpm --filter web dev                        # dashboard on http://127.0.0.1:4321
```

Or, with Docker:

```sh
POSTGRES_PASSWORD=change-me docker compose up --build
```

Only audit sites you own or are allowed to crawl.

## Documentation

- [User guide](docs/user-guide.md): install, run audits, read scores, the dashboard, self-hosting.
- [Checks reference](docs/checks.md): what each check flags and how to fix it.
- [Developer guide](docs/developer-guide.md): architecture, adding a check, storage, API, tests, CI.
- [Contributing](CONTRIBUTING.md)

## About

zero-audit is built by [Zero Stratégie](https://zero-strategie.dev). Its feature set is inspired by commercial site-audit tools such as Semrush's Site Audit. It is an independent project, not affiliated with or endorsed by Semrush, and it contains no Semrush code, data or text.

## Licence

[MIT](LICENSE) © 2026 Zero Stratégie
