import type { PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import { isHtml2xx } from './page-predicates.js';

/** `undefined` when the page cannot be judged (not HTML 2xx, no facts as in old snapshots). */
const hasFrames = (page: Page): boolean | undefined => {
  if (!isHtml2xx(page) || page.htmlFacts === null) return undefined;
  const declared = page.htmlFacts['hasFrames'];
  return typeof declared === 'boolean' ? declared : undefined;
};

/** Only `<frameset>` and `<frame>` count: an `<iframe>` embeds content without replacing the page structure. */
export const check121: PageCheck = {
  id: 121,
  severity: 'warning',
  theme: 'on-page',
  scope: 'page',
  label: 'Page construite en frames',
  applies: (page) => hasFrames(page) !== undefined,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => hasFrames(page) === true)
      .map((page) => ({ checkId: 121, pageUrl: page.url, info: {} })),
};
