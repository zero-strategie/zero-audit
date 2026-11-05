import type { IssueOccurrence, SiteCheck } from '../../check.js';
import type { SiteFile } from '../../crawl.js';

const toOccurrence = (file: SiteFile): IssueOccurrence | null => {
  const facts = file.facts;
  if (facts === null || facts['truncated'] === true) return null;
  const issues = facts['issues'];
  const total =
    typeof issues === 'object' && issues !== null && 'total' in issues ? issues.total : 0;
  const malformedXml = facts['malformedXml'] === true;
  if (!malformedXml && total === 0) return null;
  return { checkId: 17, pageUrl: null, info: { sitemap: file.url, malformedXml, issues } };
};

export const check17: SiteCheck = {
  id: 17,
  severity: 'error',
  theme: 'crawlability',
  scope: 'site',
  label: 'Sitemap invalide',
  run: ({ crawl }) =>
    crawl.siteFiles
      .filter((file) => file.kind === 'sitemap')
      .flatMap((file) => toOccurrence(file) ?? []),
};
