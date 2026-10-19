import type { SnapshotReport } from '../application/get-snapshot-report.js';
import type { CheckResult, Severity } from '../domain/check.js';
import type { Page, SiteFile, SiteFileKind } from '../domain/crawl.js';
import { PAGE_GROUPS, type PageGroup } from '../domain/page-groups.js';
import type { CheckDiff } from '../domain/snapshot-diff.js';
import { summaryScoreLines } from './render-scores.js';

const SEVERITY_ORDER: readonly Severity[] = ['error', 'warning', 'notice'];
const SEVERITY_TITLES: Readonly<Record<Severity, string>> = {
  error: 'Erreurs',
  warning: 'Avertissements',
  notice: 'Notices',
};
const GROUP_TITLES: Readonly<Record<PageGroup, string>> = {
  healthy: 'Saines',
  'have-issues': 'Avec problèmes',
  broken: 'Cassées',
  redirect: 'Redirigées',
  blocked: 'Bloquées',
};
const SITE_FILE_NAMES: Readonly<Record<SiteFileKind, string>> = {
  robots: 'robots.txt',
  sitemap: 'sitemap',
  llms: 'llms.txt',
};
const NO_SITE_FILE_LINE = '  Aucun';
const STATUS_CLASS_SIZE = 100;
const STATUS_CLASSES = [2, 3, 4, 5] as const;

const countPages = (pages: readonly Page[], matches: (page: Page) => boolean): number =>
  pages.filter(matches).length;

const groupLines = ({ pageGroups }: SnapshotReport): string[] =>
  PAGE_GROUPS.map((group) => {
    const variation = pageGroups.variation[group];
    const suffix = variation === null ? '' : ` (${signedDelta(variation)})`;
    return `  ${GROUP_TITLES[group]} : ${String(pageGroups.counts[group])}${suffix}`;
  });

const statusClassLines = (allPages: readonly Page[]): string[] => {
  const pages = allPages.filter((page) => !page.blockedByRobots);
  return [
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
};

const siteFileLines = (files: readonly SiteFile[]): string[] =>
  files.length === 0
    ? [NO_SITE_FILE_LINE]
    : files.map(({ kind, url, status, error }) => {
        const outcome = status === null ? `erreur réseau (${error ?? 'inconnue'})` : String(status);
        return `  ${SITE_FILE_NAMES[kind]} : ${outcome} (${url})`;
      });

const occurrencesBySeverity = (results: readonly CheckResult[], severity: Severity): number =>
  results
    .filter((result) => result.severity === severity)
    .reduce((total, result) => total + result.count, 0);

const severityRank = (severity: Severity): number => SEVERITY_ORDER.indexOf(severity);

const signedDelta = (delta: number): string => (delta > 0 ? `+${String(delta)}` : String(delta));

const evolution = (diff: CheckDiff | undefined): string =>
  diff
    ? ` – Δ ${signedDelta(diff.delta)} – nouvelles ${String(diff.newCount)} – corrigées ${String(diff.fixedCount)}`
    : '';

const triggeredLines = (
  results: readonly CheckResult[],
  diffs: readonly CheckDiff[],
  labels: ReadonlyMap<number, string>,
): string[] =>
  results
    .filter((result) => result.count > 0)
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.checkId - b.checkId)
    .map(
      (result) =>
        `  ${String(result.checkId)} – ${labels.get(result.checkId) ?? 'Check inconnu'} – ${String(result.count)} / ${String(result.examined)}${evolution(diffs.find((diff) => diff.checkId === result.checkId))}`,
    );

export const renderSummary = (
  report: SnapshotReport,
  labels: ReadonlyMap<number, string>,
): string => {
  const { details, checkDiffs, scores } = report;
  const { snapshot, pages, checkResults } = details;
  return [
    `Audit ${snapshot.id} (${snapshot.status})`,
    `Pages explorées : ${String(snapshot.pagesCrawled)} / ${String(snapshot.pagesLimit)}`,
    '',
    'Scores',
    ...summaryScoreLines(scores),
    '',
    'Pages par groupe',
    ...groupLines(report),
    '',
    'Pages par statut',
    ...statusClassLines(pages),
    '',
    'Fichiers techniques',
    ...siteFileLines(details.siteFiles),
    '',
    'Problèmes',
    ...SEVERITY_ORDER.map(
      (severity) =>
        `  ${SEVERITY_TITLES[severity]} : ${String(occurrencesBySeverity(checkResults, severity))}`,
    ),
    '',
    'Checks déclenchés',
    ...triggeredLines(checkResults, checkDiffs, labels),
    '',
  ].join('\n');
};
