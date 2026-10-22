import { MAX_FACT_EXAMPLES, type SiteFileFacts } from '../domain/crawl.js';
import type { HttpResponse } from './ports/http-client.js';
import type { SitemapReadResult } from './ports/sitemap-reader.js';

export type SitemapIssueFact = {
  readonly type: string;
  readonly source: string;
  readonly loc: string | null;
  readonly value: string | null;
};

/** What one fetched sitemap document tells about itself, before children are folded in. */
export interface SitemapObservation {
  readonly malformedXml: boolean;
  readonly truncated: boolean;
  readonly sizeBytes: number;
  readonly contentLength: number | null;
  readonly contentEncoding: string | null;
  readonly urlCount: number;
  readonly issues: readonly SitemapIssueFact[];
}

const DIGITS_ONLY = /^\d+$/;

const declaredLength = (header: string | undefined): number | null =>
  header !== undefined && DIGITS_ONLY.test(header.trim()) ? Number(header) : null;

export const observeSitemap = (
  url: string,
  response: HttpResponse,
  read: SitemapReadResult,
): SitemapObservation => ({
  // A cut body is not well-formed, but the cut is the finding, not the XML.
  malformedXml: read.malformedXml && !response.truncated,
  truncated: response.truncated,
  sizeBytes: Buffer.byteLength(response.body),
  contentLength: declaredLength(response.headers['content-length']),
  contentEncoding: response.headers['content-encoding'] ?? null,
  urlCount: read.sitemap?.entryCount ?? 0,
  issues: (read.sitemap?.issues ?? []).map(({ type, loc, value }) => ({
    type,
    source: url,
    loc,
    value,
  })),
});

/** The facts of an index are its own plus those of its children (counts and issues cumulated). */
export const toSitemapFacts = (
  own: SitemapObservation,
  children: readonly SitemapObservation[],
  isIndex: boolean,
): SiteFileFacts => {
  const all = [own, ...children];
  const issues = all.flatMap((observation) => observation.issues);
  return {
    malformedXml: all.some((observation) => observation.malformedXml),
    truncated: all.some((observation) => observation.truncated),
    sizeBytes: own.sizeBytes,
    contentLength: own.contentLength,
    contentEncoding: own.contentEncoding,
    urlCount: isIndex ? children.reduce((sum, child) => sum + child.urlCount, 0) : own.urlCount,
    issues: { total: issues.length, examples: issues.slice(0, MAX_FACT_EXAMPLES) },
  };
};
