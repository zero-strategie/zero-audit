#!/usr/bin/env node
import { JsonLinesAuditEvents } from '../infrastructure/json-lines-audit-events.js';
import { SystemClock } from '../infrastructure/system-clock.js';
import { createInterruptController } from './interrupt-controller.js';
import { runCli } from './run-cli.js';

const interrupts = createInterruptController(
  (code) => process.exit(code),
  new JsonLinesAuditEvents(process.stdout, new SystemClock()),
);

process.once('SIGINT', () => {
  void interrupts.interrupt();
});

process.once('SIGTERM', () => {
  void interrupts.terminate();
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
    onWorkerProcessStarted: (worker) => {
      interrupts.onWorkerProcessStarted(worker);
    },
    onAuditStarted: (snapshotId, rootUrl) => {
      interrupts.onAuditStarted(snapshotId, rootUrl);
    },
  },
);
process.exit(exitCode);
