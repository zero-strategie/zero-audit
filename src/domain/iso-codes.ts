const X_DEFAULT = 'x-default';
const UNKNOWN_REGION = 'ZZ';
const ALPHA2_REGION = /^[A-Za-z]{2}$/;

const displayName = (type: 'language' | 'script' | 'region', code: string): string | undefined =>
  new Intl.DisplayNames(['en'], { type, fallback: 'none' }).of(code);

const canonicalOf = (value: string): string | undefined => {
  try {
    const [canonical] = Intl.getCanonicalLocales(value);
    return canonical?.toLowerCase() === value.toLowerCase() ? canonical : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Whether a hreflang value is `x-default` or `language[-script][-region]` with every subtag known
 * to the ICU data of the runtime. Case is ignored; variants and extensions are rejected.
 */
export const isValidHreflang = (value: string): boolean => {
  if (value.toLowerCase() === X_DEFAULT) return true;
  const canonical = canonicalOf(value);
  if (canonical === undefined) return false;

  const { language, script, region } = new Intl.Locale(canonical);
  const rebuilt = [language, script, region].filter((part) => part !== undefined).join('-');
  if (rebuilt !== canonical) return false;
  if (displayName('language', language) === undefined) return false;
  if (script !== undefined && displayName('script', script) === undefined) return false;
  if (region === undefined) return true;
  return (
    ALPHA2_REGION.test(region) &&
    region !== UNKNOWN_REGION &&
    displayName('region', region) !== undefined
  );
};
