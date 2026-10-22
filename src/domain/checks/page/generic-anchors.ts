const WHITESPACE_RUN = /\s+/g;
const TRAILING_PUNCTUATION = /[\p{P}\s]+$/u;

/** Closed list of anchors that say nothing about their target, compared after `normalizeAnchor`. */
export const GENERIC_ANCHORS: ReadonlySet<string> = new Set([
  'cliquez ici',
  'ici',
  'en savoir plus',
  'lire la suite',
  'voir plus',
  'plus',
  'click here',
  'here',
  'read more',
  'learn more',
  'more',
  'link',
  'lien',
]);

export const normalizeAnchor = (anchor: string): string =>
  anchor.toLowerCase().replace(WHITESPACE_RUN, ' ').trim().replace(TRAILING_PUNCTUATION, '');

export const isGenericAnchor = (anchor: string | null): boolean =>
  anchor !== null && GENERIC_ANCHORS.has(normalizeAnchor(anchor));
