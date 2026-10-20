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

const WWW_PREFIX = 'www.';
const IPV4_HOST = /^\d+(?:\.\d+){3}$/;
const IPV6_HOST_PREFIX = '[';
const LOCALHOST = 'localhost';

const hasNoAlternate = (hostname: string): boolean =>
  hostname === LOCALHOST || IPV4_HOST.test(hostname) || hostname.startsWith(IPV6_HOST_PREFIX);

/** Home page of the same site on the other host (www. added or removed); null for IPs and localhost. */
export const alternateHostUrl = (rootUrl: string): string | null => {
  const parsed = new URL(rootUrl);
  if (hasNoAlternate(parsed.hostname)) return null;
  parsed.hostname = parsed.hostname.startsWith(WWW_PREFIX)
    ? parsed.hostname.slice(WWW_PREFIX.length)
    : `${WWW_PREFIX}${parsed.hostname}`;
  parsed.pathname = '/';
  parsed.search = '';
  parsed.hash = '';
  return parsed.href;
};

const ROOT_PATH = '/';

/** Same URL with the trailing slash added or removed (query kept); null for a site root. */
export const toggleTrailingSlash = (url: string): string | null => {
  const parsed = new URL(url);
  if (parsed.pathname === ROOT_PATH) return null;
  parsed.pathname = parsed.pathname.endsWith(ROOT_PATH)
    ? parsed.pathname.slice(0, -ROOT_PATH.length)
    : `${parsed.pathname}${ROOT_PATH}`;
  return parsed.href;
};
