import type { SnapshotComparison } from '../application/compare-snapshots.js';
import type { IssueOccurrence } from '../domain/check.js';
import type { CheckDiff } from '../domain/snapshot-diff.js';

const signedDelta = (delta: number): string => (delta > 0 ? `+${String(delta)}` : String(delta));

const describeOccurrence = ({ pageUrl, info }: IssueOccurrence): string => {
  const location = pageUrl ?? '(site)';
  return Object.keys(info).length === 0 ? location : `${location} ${JSON.stringify(info)}`;
};

const hasChanged = (diff: CheckDiff): boolean =>
  diff.delta !== 0 || diff.newCount > 0 || diff.fixedCount > 0;

const checkLines = (diff: CheckDiff, labels: ReadonlyMap<number, string>): string[] => [
  `  ${String(diff.checkId)} – ${labels.get(diff.checkId) ?? 'Check inconnu'} – A ${String(diff.count - diff.delta)} → B ${String(diff.count)} – Δ ${signedDelta(diff.delta)} – nouvelles ${String(diff.newCount)} – corrigées ${String(diff.fixedCount)}`,
  ...diff.added.map((occurrence) => `    + ${describeOccurrence(occurrence)}`),
  ...diff.removed.map((occurrence) => `    - ${describeOccurrence(occurrence)}`),
];

export const renderComparison = (
  { base, target, checkDiffs }: SnapshotComparison,
  labels: ReadonlyMap<number, string>,
): string => {
  const lines = [`Comparaison : A ${base.id} → B ${target.id}`, ''];
  if (!checkDiffs.some(hasChanged)) lines.push('Aucune différence entre les deux snapshots.');
  const listed = [...checkDiffs]
    .filter((diff) => diff.count > 0 || hasChanged(diff))
    .sort((a, b) => a.checkId - b.checkId);
  lines.push(...listed.flatMap((diff) => checkLines(diff, labels)));
  return `${lines.join('\n')}\n`;
};
