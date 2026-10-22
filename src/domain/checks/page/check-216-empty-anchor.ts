import type { IssueOccurrence, PageCheck } from '../../check.js';
import type { Link } from '../../crawl.js';
import { indexedTargetsBySource, type LinkFilter } from '../link-helpers.js';
import { isHtml2xx } from './page-predicates.js';

const isAnchorLink: LinkFilter = (link: Link) => link.type !== 'resource';
const hasEmptyAnchor: LinkFilter = (link: Link) =>
  isAnchorLink(link) && (link.anchor?.trim() ?? '') === '';

export const check216: PageCheck = {
  id: 216,
  severity: 'notice',
  theme: 'linking',
  scope: 'page',
  label: 'Page avec des liens sans texte d’ancrage',
  applies: (page, { crawl }) =>
    isHtml2xx(page) && indexedTargetsBySource(crawl, isAnchorLink).has(page.url),
  run: ({ crawl }) => {
    const targetsBySource = indexedTargetsBySource(crawl, hasEmptyAnchor);
    const occurrences: IssueOccurrence[] = [];
    for (const page of crawl.pages) {
      const targets = targetsBySource.get(page.url);
      if (!isHtml2xx(page) || targets === undefined) continue;
      occurrences.push({ checkId: 216, pageUrl: page.url, info: { targets } });
    }
    return occurrences;
  },
};
