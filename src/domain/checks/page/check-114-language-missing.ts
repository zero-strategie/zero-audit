import type { PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import { isHtml2xx } from './page-predicates.js';

interface LanguageFacts {
  readonly hasLang: boolean;
  readonly hasHreflang: boolean;
}

/** `undefined` when the page cannot be judged (not HTML 2xx, no facts as in old snapshots). */
const languageOf = (page: Page): LanguageFacts | undefined => {
  if (!isHtml2xx(page) || page.htmlFacts === null) return undefined;
  const lang = page.htmlFacts['lang'];
  const hreflang = page.htmlFacts['hreflang'];
  if (!Array.isArray(hreflang)) return undefined;
  return { hasLang: typeof lang === 'string' && lang !== '', hasHreflang: hreflang.length > 0 };
};

/** Either a `lang` attribute or a hreflang alternate tells engines which language the page is in. */
export const check114: PageCheck = {
  id: 114,
  severity: 'warning',
  theme: 'international',
  scope: 'page',
  label: 'Langue de la page non déclarée',
  applies: (page) => languageOf(page) !== undefined,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => {
        const language = languageOf(page);
        return language !== undefined && !language.hasLang && !language.hasHreflang;
      })
      .map((page) => ({ checkId: 114, pageUrl: page.url, info: {} })),
};
