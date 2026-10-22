import type { Page } from '../../crawl.js';
import type { PageCheck } from '../../check.js';
import { hasHttpResponse } from './page-predicates.js';

const EXCLUDING_DIRECTIVES: ReadonlySet<string> = new Set(['noindex', 'none']);
const AGENT_PREFIX = /^[^,:]+:\s*/;

const excludesFromIndex = (headerValue: string): boolean =>
  headerValue
    .split(',')
    .map((directive) => directive.trim().replace(AGENT_PREFIX, '').toLowerCase())
    .some((directive) => EXCLUDING_DIRECTIVES.has(directive));

const flaggedValue = (page: Page): string | null => {
  const value = page.headers['x-robots-tag'];
  return value !== undefined && excludesFromIndex(value) ? value : null;
};

export const check209: PageCheck = {
  id: 209,
  severity: 'notice',
  theme: 'crawlability',
  scope: 'page',
  label: 'Page exclue de l’index par l’en-tête X-Robots-Tag',
  applies: hasHttpResponse,
  run: ({ crawl }) =>
    crawl.pages.flatMap((page) => {
      const value = flaggedValue(page);
      return value === null ? [] : [{ checkId: 209, pageUrl: page.url, info: { value } }];
    }),
};
