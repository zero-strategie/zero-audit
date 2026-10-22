import type { HtmlFacts, SiteFileFacts } from '../domain/crawl.js';

const NUL_ESCAPE = /\\u0000/g;
const REPLACEMENT_ESCAPE = '\\uFFFD';

/** Postgres JSONB rejects U+0000, which raw file content (e.g. UTF-16 read as UTF-8) can carry. */
export const stringifyFacts = (facts: HtmlFacts | SiteFileFacts | null): string | null =>
  facts === null ? null : JSON.stringify(facts).replace(NUL_ESCAPE, REPLACEMENT_ESCAPE);

/** What a database adapter would give back, so the in-memory adapter honours the same contract. */
export const normalizeFacts = <T extends HtmlFacts | SiteFileFacts | null>(facts: T): T => {
  const json = stringifyFacts(facts);
  return json === null ? facts : (JSON.parse(json) as T);
};
