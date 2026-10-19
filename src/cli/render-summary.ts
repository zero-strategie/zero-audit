import type { SnapshotDetails } from '../application/ports/snapshot-repository.js';
import type { CheckResult, Severity } from '../domain/check.js';
import type { Page } from '../domain/crawl.js';

const SEVERITY_ORDER: readonly Severity[] = ['error', 'warning', 'notice'];
const SEVERITY_TITLES: Readonly<Record<Severity, string>> = {
  error: 'Erreurs',
  warning: 'Avertissements',
  notice: 'Notices',
};
const STATUS_CLASS_SIZE = 100;
const STATUS_CLASSES = [2, 3, 4, 5] as const;

const countPages = (pages: readonly Page[], matches: (page: Page) => boolean): number =>
  pages.filter(matches).length;

const statusClassLines = (pages: readonly Page[]): string[] => [
  ...STATUS_CLASSES.map(
    (digit) =>
      `  ${String(digit)}xx : ${String(
        countPages(
          pages,
          ({ status }) => status !== null && Math.floor(status / STATUS_CLASS_SIZE) === digit,
        ),
      )}`,
  ),
  `  Erreur réseau : ${String(countPages(pages, ({ status }) => status === null))}`,
];

const occurrencesBySeverity = (results: readonly CheckResult[], severity: Severity): number =>
  results
    .filter((result) => result.severity === severity)
    .reduce((total, result) => total + result.count, 0);

const severityRank = (severity: Severity): number => SEVERITY_ORDER.indexOf(severity);

const triggeredLines = (
  results: readonly CheckResult[],
  labels: ReadonlyMap<number, string>,
): string[] =>
  results
    .filter((result) => result.count > 0)
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.checkId - b.checkId)
    .map(
      (result) =>
        `  ${String(result.checkId)} – ${labels.get(result.checkId) ?? 'Check inconnu'} – ${String(result.count)} / ${String(result.examined)}`,
    );

export const renderSummary = (
  details: SnapshotDetails,
  labels: ReadonlyMap<number, string>,
): string => {
  const { snapshot, pages, checkResults } = details;
  return [
    `Audit ${snapshot.id} (${snapshot.status})`,
    `Pages explorées : ${String(snapshot.pagesCrawled)} / ${String(snapshot.pagesLimit)}`,
    '',
    'Pages par statut',
    ...statusClassLines(pages),
    '',
    'Problèmes',
    ...SEVERITY_ORDER.map(
      (severity) =>
        `  ${SEVERITY_TITLES[severity]} : ${String(occurrencesBySeverity(checkResults, severity))}`,
    ),
    '',
    'Checks déclenchés',
    ...triggeredLines(checkResults, labels),
    '',
  ].join('\n');
};
