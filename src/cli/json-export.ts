import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SnapshotDetails } from '../application/ports/snapshot-repository.js';

const JSON_INDENT = 2;

export const writeJsonExport = (path: string, details: SnapshotDetails): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(details, null, JSON_INDENT)}\n`);
};
