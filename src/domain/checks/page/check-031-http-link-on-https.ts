import type { IssueOccurrence, PageCheck } from '../../check.js';
import type { Link } from '../../crawl.js';
import { finalRootUrl } from '../final-root-url.js';
import { indexedTargetsBySource, targetsBySource, type LinkFilter } from '../link-helpers.js';
import { isHtml2xx } from './page-predicates.js';

const HTTP_PREFIX = 'http:';
const HTTPS_PREFIX = 'https:';

const isInternalAnchor: LinkFilter = (link: Link) => link.type === 'internal';
const isInternalHttpAnchor: LinkFilter = (link: Link) =>
  isInternalAnchor(link) && link.targetUrl.startsWith(HTTP_PREFIX);

export const check31: PageCheck = {
  id: 31,
  severity: 'warning',
  theme: 'https',
  scope: 'page',
  label: 'Page avec des liens internes en http sur un site https',
  applies: (page, { crawl }) =>
    finalRootUrl(crawl).startsWith(HTTPS_PREFIX) &&
    isHtml2xx(page) &&
    indexedTargetsBySource(crawl, isInternalAnchor).has(page.url),
  run: ({ crawl }) => {
    if (!finalRootUrl(crawl).startsWith(HTTPS_PREFIX)) return [];
    const targets = targetsBySource(crawl.links, isInternalHttpAnchor);
    const occurrences: IssueOccurrence[] = [];
    for (const page of crawl.pages) {
      const pageTargets = targets.get(page.url);
      if (!isHtml2xx(page) || pageTargets === undefined) continue;
      occurrences.push({ checkId: 31, pageUrl: page.url, info: { targets: pageTargets } });
    }
    return occurrences;
  },
};
