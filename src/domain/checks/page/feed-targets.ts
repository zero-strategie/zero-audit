import type { Page } from '../../crawl.js';

const FEED_FILE_NAMES: ReadonlySet<string> = new Set([
  'rss.xml',
  'feed.xml',
  'atom.xml',
  'index.xml',
]);
const FEED_EXTENSIONS: readonly string[] = ['.rss', '.atom'];
const FEED_MEDIA_TYPES: ReadonlySet<string> = new Set([
  'application/rss+xml',
  'application/atom+xml',
  'application/feed+json',
]);

const lastSegmentOf = (url: string): string =>
  (new URL(url).pathname.split('/').pop() ?? '').toLowerCase();

const mediaTypeOf = (contentType: string | null): string =>
  (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

/** Every feed URL announced by a `<link rel="alternate">` on any crawled page. */
export const declaredFeedUrls = (pages: readonly Page[]): ReadonlySet<string> =>
  new Set(
    pages.flatMap((page) => {
      const declared = page.htmlFacts?.['declaredFeeds'];
      return Array.isArray(declared)
        ? declared.filter((url): url is string => typeof url === 'string')
        : [];
    }),
  );

/** A target is a feed when any of four signals says so: declared, media type, extension, usual name. */
export const isFeedTarget = (
  url: string,
  crawledPage: Page | undefined,
  declaredFeeds: ReadonlySet<string>,
): boolean => {
  const segment = lastSegmentOf(url);
  return (
    declaredFeeds.has(url) ||
    FEED_MEDIA_TYPES.has(mediaTypeOf(crawledPage?.contentType ?? null)) ||
    FEED_EXTENSIONS.some((extension) => segment.endsWith(extension)) ||
    FEED_FILE_NAMES.has(segment)
  );
};
