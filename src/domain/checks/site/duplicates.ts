import type { IssueOccurrence } from '../../check.js';
import type { Page } from '../../crawl.js';

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, ' ');

/** Flags every page sharing a non-empty value with another page, listing the other pages of its group. */
export const duplicateOccurrences = (
  checkId: number,
  pages: readonly Page[],
  valueOf: (page: Page) => string | null,
): IssueOccurrence[] => {
  const groups = new Map<string, Page[]>();
  for (const page of pages) {
    const raw = valueOf(page);
    const value = raw === null ? '' : normalizeText(raw);
    if (value === '') continue;
    groups.set(value, [...(groups.get(value) ?? []), page]);
  }
  const occurrences: IssueOccurrence[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const page of group) {
      const duplicates = group
        .filter((other) => other !== page)
        .map((other) => other.url)
        .sort();
      occurrences.push({ checkId, pageUrl: page.url, info: { duplicates } });
    }
  }
  return occurrences;
};
