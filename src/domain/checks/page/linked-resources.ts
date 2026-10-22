import type { Link, Page } from '../../crawl.js';

const RESOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  'pdf',
  'zip',
  'rar',
  '7z',
  'gz',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'avif',
  'svg',
  'ico',
  'mp3',
  'mp4',
  'webm',
  'mov',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'css',
  'js',
  'json',
  'xml',
]);

const extensionOf = (url: string): string | null => {
  const lastSegment = new URL(url).pathname.split('/').pop() ?? '';
  const dot = lastSegment.lastIndexOf('.');
  return dot === -1 ? null : lastSegment.slice(dot + 1).toLowerCase();
};

const hasResourceExtension = (url: string): boolean => {
  const extension = extensionOf(url);
  return extension !== null && RESOURCE_EXTENSIONS.has(extension);
};

const isNonHtmlSuccess = (page: Page | undefined): boolean =>
  page !== undefined &&
  !page.isHtml &&
  page.status !== null &&
  page.status >= 200 &&
  page.status <= 299;

/** An internal target is judged on its crawled response too; an external one on its extension only. */
export const isLinkedResource = (link: Link, pagesByUrl: ReadonlyMap<string, Page>): boolean =>
  hasResourceExtension(link.targetUrl) ||
  (link.type === 'internal' && isNonHtmlSuccess(pagesByUrl.get(link.targetUrl)));
