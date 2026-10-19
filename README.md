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

Use `pnpm run audit`, not `pnpm audit`: `pnpm audit` is pnpm's built-in vulnerability audit and never reaches the `audit` script. `pnpm zero-audit` is an alias without that conflict. After `pnpm build`, the `zero-audit` bin (`dist/cli/main.js`) can also be linked and run directly.

Options (an option wins over its environment variable, which wins over the default):

| Option | Environment variable | Default | Meaning |
|---|---|---|---|
| `<url>` | | required | start URL (http or https) |
| `--limit <n>` | | 100 | maximum number of pages crawled |
| `--delay <ms>` | `ZERO_AUDIT_DELAY_MS` | 1000 | delay between two requests |
| `--db <path>` | `ZERO_AUDIT_DB_PATH` | `./.zero-audit/audit.db` | SQLite database file |
| `--json <file>` | | none | writes the full snapshot (pages, links, all check results) as JSON |
| `--help` | | | prints the usage |

The summary goes to stdout; the progress line (`crawled/limit`) goes to stderr, so stdout stays clean.

Exit codes: 0 success, 1 crawl failure (snapshot marked `failed`), 2 invalid usage (nothing is requested or stored), 130 interrupted with Ctrl+C (snapshot marked `failed`).
