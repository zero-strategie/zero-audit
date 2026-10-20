# Contributing

Thanks for your interest in zero-audit. Contributions are welcome. By contributing, you agree that your work is released under the [MIT licence](LICENSE).

1. Read the [developer guide](docs/developer-guide.md). It covers the architecture, how to add a check, and the testing rules.
2. Open an issue before a large change, so the approach can be agreed first.
3. Work on a branch. Write the failing test first, keep commits small, and use [Conventional Commits](https://www.conventionalcommits.org) messages in English.
4. Before opening a pull request, run:

   ```sh
   pnpm lint && pnpm typecheck && pnpm test
   ```

   If you touched storage, also run the Postgres tests with `TEST_DATABASE_URL`, as explained in the developer guide.

5. In the pull request, explain what changes for users and how you tested it.

Ground rules:

- No test may reach the Internet.
- Never crawl a third-party site in tests or CI.
- Check labels are written by us, never copied from another tool.
