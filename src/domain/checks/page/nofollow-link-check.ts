import type { IssueOccurrence, PageCheck, Severity } from '../../check.js';
import type { Link, LinkType } from '../../crawl.js';
import { hasRelToken, indexedTargetsBySource, type LinkFilter } from '../link-helpers.js';
import { isHtml2xx } from './page-predicates.js';

interface NofollowCheckSpec {
  readonly id: number;
  readonly severity: Severity;
  readonly label: string;
  readonly linkType: LinkType;
}

export const nofollowLinkCheck = ({
  id,
  severity,
  label,
  linkType,
}: NofollowCheckSpec): PageCheck => {
  const isNofollowLink: LinkFilter = (link: Link) =>
    link.type === linkType && hasRelToken(link.rel, 'nofollow');
  const isLinkOfType: LinkFilter = (link: Link) => link.type === linkType;

  return {
    id,
    severity,
    theme: 'linking',
    scope: 'page',
    label,
    applies: (page, { crawl }) =>
      isHtml2xx(page) && indexedTargetsBySource(crawl, isLinkOfType).has(page.url),
    run: ({ crawl }) => {
      const targetsBySource = indexedTargetsBySource(crawl, isNofollowLink);
      const occurrences: IssueOccurrence[] = [];
      for (const page of crawl.pages) {
        const targets = targetsBySource.get(page.url);
        if (!isHtml2xx(page) || targets === undefined) continue;
        occurrences.push({ checkId: id, pageUrl: page.url, info: { targets } });
      }
      return occurrences;
    },
  };
};
