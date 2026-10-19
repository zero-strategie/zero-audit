import type { ProjectOverview } from '../application/list-projects.js';
import type { SnapshotListing } from '../application/list-project-snapshots.js';
import type { SnapshotReport } from '../application/get-snapshot-report.js';
import { THEMES } from '../domain/check.js';
import { allChecks } from '../domain/checks/index.js';
import { PAGE_GROUPS } from '../domain/page-groups.js';

const UNKNOWN_CHECK_LABEL = 'Check inconnu';
const labels = new Map(allChecks.map(({ id, label }) => [id, label]));

const isoOrNull = (date: Date | null): string | null => date?.toISOString() ?? null;

export const presentProjectOverview = ({ project, latestSnapshot }: ProjectOverview) => ({
  id: project.id,
  rootUrl: project.rootUrl,
  createdAt: project.createdAt.toISOString(),
  latestSnapshot: latestSnapshot && {
    id: latestSnapshot.id,
    finishedAt: isoOrNull(latestSnapshot.finishedAt),
    health: latestSnapshot.health,
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

export const presentSnapshotReport = (report: SnapshotReport) => {
  const { snapshot, siteFiles } = report.details;
  return {
    snapshot: {
      id: snapshot.id,
      projectId: snapshot.projectId,
      status: snapshot.status,
      startedAt: snapshot.startedAt.toISOString(),
      finishedAt: isoOrNull(snapshot.finishedAt),
      pagesCrawled: snapshot.pagesCrawled,
      pagesLimit: snapshot.pagesLimit,
    },
    health: report.scores.health,
    themes: Object.fromEntries(THEMES.map((theme) => [theme, report.scores.themes[theme]])),
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
