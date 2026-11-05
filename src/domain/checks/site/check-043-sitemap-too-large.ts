import type { IssueOccurrence, SiteCheck } from '../../check.js';
import type { SiteFile } from '../../crawl.js';
import { SITEMAP_MAX_BYTES, SITEMAP_MAX_URLS } from '../../thresholds.js';

const TRUNCATION_NOTE = 'au moins 5 Mio reçus';

const asNumber = (value: unknown): number | null => (typeof value === 'number' ? value : null);

// With a content-encoding the declared length is the compressed size, which says nothing of the document.
const declaredBytes = (facts: NonNullable<SiteFile['facts']>): number | null =>
  facts['contentEncoding'] === null ? asNumber(facts['contentLength']) : null;

const toOccurrence = (file: SiteFile): IssueOccurrence | null => {
  const facts = file.facts;
  if (facts === null) return null;
  const truncated = facts['truncated'] === true;
  const urlCount = asNumber(facts['urlCount']) ?? 0;
  const bytes = declaredBytes(facts);
  const maxUrlCount = asNumber(facts['maxUrlCount']) ?? 0;
  const tooManyUrls = maxUrlCount > SITEMAP_MAX_URLS;
  const tooHeavy = bytes !== null && bytes > SITEMAP_MAX_BYTES;
  if (!truncated && !tooManyUrls && !tooHeavy) return null;
  return {
    checkId: 43,
    pageUrl: null,
    info: {
      sitemap: file.url,
      urlCount,
      maxUrlCount,
      ...(tooHeavy ? { bytes } : {}),
      truncated,
      ...(truncated ? { note: TRUNCATION_NOTE } : {}),
    },
  };
};

export const check43: SiteCheck = {
  id: 43,
  severity: 'error',
  theme: 'crawlability',
  scope: 'site',
  label: 'Sitemap trop volumineux',
  run: ({ crawl }) =>
    crawl.siteFiles
      .filter((file) => file.kind === 'sitemap')
      .flatMap((file) => toOccurrence(file) ?? []),
};
