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
