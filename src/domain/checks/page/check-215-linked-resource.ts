import type { IssueOccurrence, PageCheck } from '../../check.js';
import type { CrawlResult, Link, Page } from '../../crawl.js';
import { indexedTargetsBySource, targetsBySource, type LinkFilter } from '../link-helpers.js';
import { isLinkedResource } from './linked-resources.js';
import { isHtml2xx } from './page-predicates.js';

const isAnchorLink: LinkFilter = (link: Link) => link.type !== 'resource';

const pagesByUrlOf = (crawl: CrawlResult): Map<string, Page> =>
  new Map(crawl.pages.map((page) => [page.url, page]));

export const check215: PageCheck = {
  id: 215,
  severity: 'notice',
  theme: 'linking',
  scope: 'page',
  label: 'Page avec des liens vers des fichiers',
  applies: (page, { crawl }) =>
    isHtml2xx(page) && indexedTargetsBySource(crawl, isAnchorLink).has(page.url),
  run: ({ crawl }) => {
    const pagesByUrl = pagesByUrlOf(crawl);
    const targets = targetsBySource(
      crawl.links,
      (link) => isAnchorLink(link) && isLinkedResource(link, pagesByUrl),
    );
    const occurrences: IssueOccurrence[] = [];
    for (const page of crawl.pages) {
      const pageTargets = targets.get(page.url);
      if (!isHtml2xx(page) || pageTargets === undefined) continue;
      occurrences.push({ checkId: 215, pageUrl: page.url, info: { targets: pageTargets } });
    }
    return occurrences;
  },
};
