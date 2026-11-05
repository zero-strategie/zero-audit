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

const KNOWN_SCHEMES = new Set([
  'http',
  'https',
  'mailto',
  'tel',
  'sms',
  'ftp',
  'javascript',
  'data',
]);
const SCHEME_PREFIX = /^([a-z][a-z0-9+.-]*):/i;
const WEB_SCHEME_WITHOUT_COLON = /^https?\/\//i;
const WELL_FORMED_WEB_URL = /^https?:\/\/[^/?#\s]/i;
const VOID_JAVASCRIPT = /^javascript:\s*void\(\s*0?\s*\)\s*;?$/i;

/** True for an href that is broken rather than merely not followed (`#`, empty and `javascript:void(0)` are not). */
export const isMalformedHref = (href: string, baseUrl: string): boolean => {
  const trimmed = href.trim();
  if (trimmed === '' || trimmed.startsWith('#') || VOID_JAVASCRIPT.test(trimmed)) return false;
  if (WEB_SCHEME_WITHOUT_COLON.test(trimmed)) return true;
  const scheme = SCHEME_PREFIX.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme === undefined) return URL.parse(trimmed, baseUrl) === null;
  if (!KNOWN_SCHEMES.has(scheme)) return true;
  const isWebScheme = scheme === 'http' || scheme === 'https';
  return isWebScheme && (!WELL_FORMED_WEB_URL.test(trimmed) || URL.parse(trimmed) === null);
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
