import type { IssueOccurrence, PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import { isHtml2xx } from './page-predicates.js';
import {
  crawledHreflangTargetsOf,
  hreflangAlternatesOf,
  indexPagesByUrl,
} from './hreflang-facts.js';

const X_DEFAULT = 'x-default';
const SUBTAG_SEPARATOR = /[-_]/;

const primaryLanguage = (code: string): string =>
  (code.split(SUBTAG_SEPARATOR)[0] ?? '').toLowerCase();

/** Declared `lang` of an HTML 2xx page; undefined when it cannot be read. */
const declaredLangOf = (page: Page): string | undefined => {
  if (!isHtml2xx(page) || page.htmlFacts === null) return undefined;
  const lang = page.htmlFacts['lang'];
  return typeof lang === 'string' && lang.trim() !== '' ? lang : undefined;
};

/** A hreflang that announces another language than the target page declares sends engines mixed signals. */
export const check204: PageCheck = {
  id: 204,
  severity: 'notice',
  theme: 'international',
  scope: 'page',
  label: 'Langue hreflang différente de celle de la page cible',
  applies: (page) => hreflangAlternatesOf(page).length > 0,
  run: ({ crawl }) => {
    const pagesByUrl = indexPagesByUrl(crawl.pages);
    return crawl.pages.flatMap((page): IssueOccurrence[] => {
      const targets = crawledHreflangTargetsOf(page, pagesByUrl)
        .filter(({ lang }) => lang.toLowerCase() !== X_DEFAULT)
        .flatMap(({ lang, url, target }) => {
          const targetLang = declaredLangOf(target);
          return targetLang !== undefined && primaryLanguage(targetLang) !== primaryLanguage(lang)
            ? [{ lang, url, targetLang }]
            : [];
        });
      return targets.length === 0 ? [] : [{ checkId: 204, pageUrl: page.url, info: { targets } }];
    });
  },
};
