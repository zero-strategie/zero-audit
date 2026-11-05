import type { PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import { isHtml2xx } from './page-predicates.js';

interface JsonLdFacts {
  readonly invalid: number;
  readonly reasons: readonly string[];
}

/** `undefined` when the page cannot be judged (not HTML 2xx, no facts as in old snapshots). */
const jsonLdOf = (page: Page): JsonLdFacts | undefined => {
  if (!isHtml2xx(page) || page.htmlFacts === null) return undefined;
  const jsonLd = page.htmlFacts['jsonLd'];
  if (typeof jsonLd !== 'object' || jsonLd === null) return undefined;
  const { invalid, invalidReasons } = jsonLd as Record<string, unknown>;
  if (typeof invalid !== 'number' || !Array.isArray(invalidReasons)) return undefined;
  return { invalid, reasons: invalidReasons.map(String) };
};

/** Only JSON-LD is examined: no schema.org vocabulary validation, no microdata, no RDFa. */
export const check45: PageCheck = {
  id: 45,
  severity: 'error',
  theme: 'markup',
  scope: 'page',
  label: 'Données structurées JSON-LD invalides',
  applies: (page) => jsonLdOf(page) !== undefined,
  run: ({ crawl }) =>
    crawl.pages.flatMap((page) => {
      const jsonLd = jsonLdOf(page);
      if (jsonLd === undefined || jsonLd.invalid === 0) return [];
      return [
        {
          checkId: 45,
          pageUrl: page.url,
          info: { invalid: jsonLd.invalid, reasons: [...jsonLd.reasons] },
        },
      ];
    }),
};
