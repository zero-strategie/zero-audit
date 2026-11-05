import type { IssueOccurrence, PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import {
  crawledHreflangTargetsOf,
  hreflangAlternatesOf,
  indexPagesByUrl,
} from './hreflang-facts.js';

const REDIRECT_MIN = 300;

const isBrokenTarget = ({ status, error }: Page): boolean =>
  status === null ? error !== null : status >= REDIRECT_MIN;

/** A hreflang that leads to an error or a redirect is ignored: the language version is not served. */
export const check25: PageCheck = {
  id: 25,
  severity: 'error',
  theme: 'international',
  scope: 'page',
  label: 'Hreflang vers une page en erreur ou redirigée',
  applies: (page) => hreflangAlternatesOf(page).length > 0,
  run: ({ crawl }) => {
    const pagesByUrl = indexPagesByUrl(crawl.pages);
    return crawl.pages.flatMap((page): IssueOccurrence[] => {
      const targets = crawledHreflangTargetsOf(page, pagesByUrl)
        .filter(({ target }) => isBrokenTarget(target))
        .map(({ lang, url, target }) => ({ lang, url, status: target.status }));
      return targets.length === 0 ? [] : [{ checkId: 25, pageUrl: page.url, info: { targets } }];
    });
  },
};
