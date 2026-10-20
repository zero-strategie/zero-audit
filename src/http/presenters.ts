import type { ProjectOverview } from '../application/list-projects.js';
import type { SnapshotListing } from '../application/list-project-snapshots.js';
import type { SnapshotComparison } from '../application/compare-snapshots.js';
import type { SnapshotReport } from '../application/get-snapshot-report.js';
import { THEMES } from '../domain/check.js';
import { allChecks } from '../domain/checks/index.js';
import type { ScoreCard } from '../domain/scoring.js';
import { PAGE_GROUPS } from '../domain/page-groups.js';

const UNKNOWN_CHECK_LABEL = 'Check inconnu';
const labels = new Map(allChecks.map(({ id, label }) => [id, label]));
const checksById = new Map(allChecks.map((check) => [check.id, check]));

const isoOrNull = (date: Date | null): string | null => date?.toISOString() ?? null;

export const presentProjectOverview = ({
  project,
  latestSnapshot,
  latestRun,
}: ProjectOverview) => ({
  id: project.id,
  rootUrl: project.rootUrl,
  createdAt: project.createdAt.toISOString(),
  latestSnapshot: latestSnapshot && {
    id: latestSnapshot.id,
    finishedAt: isoOrNull(latestSnapshot.finishedAt),
    health: latestSnapshot.health,
  },
  latestRun: latestRun && {
    id: latestRun.id,
    status: latestRun.status,
    startedAt: latestRun.startedAt.toISOString(),
  },
});

export const presentSnapshotListing = ({ snapshot, health }: SnapshotListing) => ({
  id: snapshot.id,
  status: snapshot.status,
  startedAt: snapshot.startedAt.toISOString(),
  finishedAt: isoOrNull(snapshot.finishedAt),
  pagesCrawled: snapshot.pagesCrawled,
  health,
});

const presentScoreCard = (scores: ScoreCard) => ({
  health: scores.health,
  themes: Object.fromEntries(THEMES.map((theme) => [theme, scores.themes[theme]])),
});

export const presentSnapshotReport = (report: SnapshotReport) => {
  const { snapshot, siteFiles } = report.details;
  return {
    snapshot: {
      id: snapshot.id,
      projectId: snapshot.projectId,
      rootUrl: report.rootUrl,
      status: snapshot.status,
      startedAt: snapshot.startedAt.toISOString(),
      finishedAt: isoOrNull(snapshot.finishedAt),
      pagesCrawled: snapshot.pagesCrawled,
      pagesLimit: snapshot.pagesLimit,
    },
    ...presentScoreCard(report.scores),
    counts: {
      errors: report.severityCounts.error,
      warnings: report.severityCounts.warning,
      notices: report.severityCounts.notice,
    },
    pageGroups: Object.fromEntries(
      PAGE_GROUPS.map((group) => [
        group,
        { count: report.pageGroups.counts[group], variation: report.pageGroups.variation[group] },
      ]),
    ),
    siteFiles: siteFiles.map(({ kind, url, status, error }) => ({ kind, url, status, error })),
    topIssues: report.topIssues.map(({ checkId, severity, theme, count }) => ({
      checkId,
      label: labels.get(checkId) ?? UNKNOWN_CHECK_LABEL,
      severity,
      theme,
      count,
      delta: report.checkDiffs.find((diff) => diff.checkId === checkId)?.delta ?? 0,
    })),
  };
};

export const presentComparison = ({ base, target, checkDiffs, scores }: SnapshotComparison) => ({
  base: { id: base.id },
  target: { id: target.id },
  ...presentScoreCard(scores),
  checks: checkDiffs.map((diff) => {
    const check = checksById.get(diff.checkId);
    return {
      checkId: diff.checkId,
      label: check?.label ?? UNKNOWN_CHECK_LABEL,
      severity: check?.severity ?? null,
      theme: check?.theme ?? null,
      countA: diff.count - diff.delta,
      countB: diff.count,
      delta: diff.delta,
      newCount: diff.newCount,
      fixedCount: diff.fixedCount,
      added: diff.added.map(({ pageUrl, info }) => ({ pageUrl, info })),
      removed: diff.removed.map(({ pageUrl, info }) => ({ pageUrl, info })),
    };
  }),
});
