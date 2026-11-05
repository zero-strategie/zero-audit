import { THEMES, type Theme } from './check.js';

const LEGACY_THEMES: Readonly<Record<string, Theme>> = {
  markup: 'on-page',
  content: 'on-page',
  status: 'crawlability',
  links: 'linking',
};

/** Checks that belong to the `markup` theme since milestone 4; milestone 1 stored it for other checks. */
const MARKUP_CHECK_IDS: ReadonlySet<number> = new Set([45, 222]);

const isTheme = (value: string): value is Theme => (THEMES as readonly string[]).includes(value);

/** Maps a stored theme to the current closed set; applied when reading, never persisted. */
export const toTheme = (stored: string, checkId: number): Theme => {
  if (stored === 'markup' && MARKUP_CHECK_IDS.has(checkId)) return 'markup';
  const legacy = LEGACY_THEMES[stored];
  if (legacy) return legacy;
  return isTheme(stored) ? stored : 'other';
};
