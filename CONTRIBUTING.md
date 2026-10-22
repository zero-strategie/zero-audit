# Contributing

Thanks for your interest in zero-audit. Contributions are welcome.

zero-audit is released under the [GNU AGPL-3.0](LICENSE) and is also offered under a commercial licence. By contributing, you accept the [Contributor Licence Agreement](CLA.md), which keeps that dual licensing possible.

In short: the core is under `AGPL-3.0-only`, and Zero Stratégie also uses it in its hosted service under another licence. The CLA is what lets your contribution be included there. Your copyright stays yours. You accept it by ticking the box in the pull-request template.

1. Read the [developer guide](docs/developer-guide.md). It covers the architecture, how to add a check, and the testing rules.
2. Open an issue before a large change, so the approach can be agreed first.
3. Work on a branch. Write the failing test first, keep commits small, and use [Conventional Commits](https://www.conventionalcommits.org) messages in English.
4. Before opening a pull request, run:

   ```sh
   pnpm lint && pnpm typecheck && pnpm test
   ```

   If you touched storage, run the whole suite with the Postgres tests, and make sure none is skipped:

   ```sh
   TEST_DATABASE_URL=postgresql://zero_audit@127.0.0.1:55432/zero_audit_test pnpm test
   ```

   The developer guide explains how to get a throwaway Postgres.

5. In the pull request, explain what changes for users and how you tested it.

Ground rules:

- Use Conventional Commits in English.
- No test may reach the Internet.
- Never crawl a third-party site in tests or CI.
- Check labels are written by us, never copied from another tool.
