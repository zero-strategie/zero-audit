const FOLLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export const normalizeUrl = (url: string): string => {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.href;
};

export const resolveUrl = (href: string, baseUrl: string): string | null => {
  const trimmed = href.trim();
  if (trimmed === '' || trimmed.startsWith('#')) return null;
  const resolved = URL.parse(trimmed, baseUrl);
  if (resolved === null || !FOLLOWED_PROTOCOLS.has(resolved.protocol)) return null;
  return normalizeUrl(resolved.href);
};

export const isInternal = (url: string, internalHost: string): boolean =>
  new URL(url).hostname === internalHost.toLowerCase();
