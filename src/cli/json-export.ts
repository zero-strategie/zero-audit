import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SnapshotReport } from '../application/get-snapshot-report.js';

const JSON_INDENT = 2;

const withDeltas = ({ details, checkDiffs, scores, pageGroups }: SnapshotReport) => ({
  ...details,
  scores,
  pageGroups,
  checkResults: details.checkResults.map((result) => {
    const diff = checkDiffs.find(({ checkId }) => checkId === result.checkId);
    return {
      ...result,
      delta: diff?.delta ?? 0,
      newCount: diff?.newCount ?? 0,
      fixedCount: diff?.fixedCount ?? 0,
    };
  }),
});

export const writeJsonExport = (path: string, report: SnapshotReport): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(withDeltas(report), null, JSON_INDENT)}\n`);
};
