#!/usr/bin/env node
import { createInterruptController } from './interrupt-controller.js';
import { runCli } from './run-cli.js';

const interrupts = createInterruptController((code) => process.exit(code));

process.once('SIGINT', () => {
  void interrupts.interrupt();
});

const exitCode = await runCli(
  process.argv.slice(2),
  process.env,
  {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    stderrIsTty: process.stderr.isTTY,
  },
  {
    onStorageOpened: (storage) => {
      interrupts.onStorageOpened(storage);
    },
    onAuditStarted: (snapshotId) => {
      interrupts.onAuditStarted(snapshotId);
    },
  },
);
process.exit(exitCode);
