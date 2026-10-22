import type { IssueOccurrence, PageCheck } from '../../check.js';
import type { Link } from '../../crawl.js';
import { indexedTargetsBySource, type LinkFilter } from '../link-helpers.js';
import { isGenericAnchor } from './generic-anchors.js';
import { isHtml2xx } from './page-predicates.js';

const isAnchorLink: LinkFilter = (link: Link) => link.type !== 'resource';
const hasGenericAnchor: LinkFilter = (link: Link) =>
  isAnchorLink(link) && isGenericAnchor(link.anchor);

export const check217: PageCheck = {
  id: 217,
  severity: 'notice',
  theme: 'linking',
  scope: 'page',
  label: 'Page avec des liens à l’ancre non descriptive',
  applies: (page, { crawl }) =>
    isHtml2xx(page) && indexedTargetsBySource(crawl, isAnchorLink).has(page.url),
  run: ({ crawl }) => {
    const targetsBySource = indexedTargetsBySource(crawl, hasGenericAnchor);
    const occurrences: IssueOccurrence[] = [];
    for (const page of crawl.pages) {
      const targets = targetsBySource.get(page.url);
      if (!isHtml2xx(page) || targets === undefined) continue;
      occurrences.push({ checkId: 217, pageUrl: page.url, info: { targets } });
    }
    return occurrences;
  },
};
