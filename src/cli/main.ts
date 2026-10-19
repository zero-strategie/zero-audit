#!/usr/bin/env node
import type { SnapshotRepository } from '../application/ports/snapshot-repository.js';
import { EXIT_INTERRUPTED, runCli } from './run-cli.js';

let interrupt: (() => void) | null = null;

process.once('SIGINT', () => interrupt?.());

const exitCode = await runCli(
  process.argv.slice(2),
  process.env,
  {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    stderrIsTty: process.stderr.isTTY,
  },
  {
    onAuditStarted: (repository: SnapshotRepository, snapshotId: string) => {
      interrupt = () => {
        void repository.fail(snapshotId, new Date()).finally(() => {
          process.exit(EXIT_INTERRUPTED);
        });
      };
    },
  },
);
process.exit(exitCode);
