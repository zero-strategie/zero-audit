import type { IssueOccurrence, PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import { normalizeUrl } from '../../url.js';
import { isHtml2xx } from '../page/page-predicates.js';
import { duplicateOccurrences } from './duplicates.js';

const normalizedCanonical = (page: Page): string | null =>
  page.canonical === null ? null : normalizeUrl(page.canonical);

const sharesOneCanonical = (group: readonly Page[]): boolean => {
  const [first] = group;
  if (first === undefined) return false;
  const canonical = normalizedCanonical(first);
  return canonical !== null && group.every((page) => normalizedCanonical(page) === canonical);
};

const duplicatesOf = (occurrence: IssueOccurrence): string[] => {
  const { duplicates } = occurrence.info as { duplicates: string[] };
  return duplicates;
};

/** Exact duplicates only (same content hash); a group that agrees on one canonical is already consolidated. */
export const check7: PageCheck = {
  id: 7,
  severity: 'error',
  theme: 'crawlability',
  scope: 'page',
  label: 'Pages au contenu strictement identique',
  applies: isHtml2xx,
  run: ({ crawl }) => {
    const pages = crawl.pages.filter(isHtml2xx);
    const pagesByUrl = new Map(pages.map((page) => [page.url, page]));
    return duplicateOccurrences(7, pages, (page) => page.contentHash).filter((occurrence) => {
      const members = [occurrence.pageUrl, ...duplicatesOf(occurrence)].flatMap((url) => {
        const page = url === null ? undefined : pagesByUrl.get(url);
        return page === undefined ? [] : [page];
      });
      return !sharesOneCanonical(members);
    });
  },
};
