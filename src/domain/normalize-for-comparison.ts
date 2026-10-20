const COMPARISON_LOCALE = 'fr';

/** Makes two texts comparable regardless of spacing and letter case. */
export const normalizeForComparison = (text: string): string =>
  text.replace(/\s+/g, ' ').trim().toLocaleLowerCase(COMPARISON_LOCALE);
