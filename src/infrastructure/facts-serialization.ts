import type { HtmlFacts, SiteFileFacts } from '../domain/crawl.js';

const NUL = '\u0000';
const REPLACEMENT_CHARACTER = '�';

const replaceNul = (_key: string, value: unknown): unknown =>
  typeof value === 'string' ? value.replaceAll(NUL, REPLACEMENT_CHARACTER) : value;

/** Postgres JSONB rejects U+0000, which raw file content (e.g. UTF-16 read as UTF-8) can carry. */
export const stringifyJson = (value: unknown): string => JSON.stringify(value, replaceNul);

export const stringifyFacts = (facts: HtmlFacts | SiteFileFacts | null): string | null =>
  facts === null ? null : stringifyJson(facts);

/** What a database adapter would give back, so the in-memory adapter honours the same contract. */
export const normalizeFacts = <T extends HtmlFacts | SiteFileFacts | null>(facts: T): T => {
  const json = stringifyFacts(facts);
  return json === null ? facts : (JSON.parse(json) as T);
};

export const normalizeOccurrenceInfo = <T>(info: T): T => JSON.parse(stringifyJson(info)) as T;
