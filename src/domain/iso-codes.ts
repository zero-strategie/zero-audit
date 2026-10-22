const X_DEFAULT = 'x-default';
const UNKNOWN_REGION = 'ZZ';
const ALPHA2_REGION = /^[A-Za-z]{2}$/;

/**
 * Current ISO 639-1 codes that CLDR rewrites to another code (`tl` to `fil`, `tw` to `ak`).
 * They are valid hreflang languages, so they are mapped before the ICU checks; withdrawn codes
 * such as `iw` or `in` are deliberately absent.
 */
const ISO_639_1_CLDR_ALIASES: Readonly<Record<string, string>> = { tl: 'fil', tw: 'ak' };

const NAMES = {
  language: new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }),
  script: new Intl.DisplayNames(['en'], { type: 'script', fallback: 'none' }),
  region: new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' }),
};

const displayName = (type: keyof typeof NAMES, code: string): string | undefined =>
  NAMES[type].of(code);

const resolveLanguageAlias = (value: string): string => {
  const [language = '', ...rest] = value.split('-');
  const alias = ISO_639_1_CLDR_ALIASES[language.toLowerCase()];
  return alias === undefined ? value : [alias, ...rest].join('-');
};

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
  const canonical = canonicalOf(resolveLanguageAlias(value));
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
