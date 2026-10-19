import { THEMES, type Theme } from './check.js';

const LEGACY_THEMES: Readonly<Record<string, Theme>> = {
  markup: 'on-page',
  content: 'on-page',
  status: 'crawlability',
  links: 'linking',
};

const isTheme = (value: string): value is Theme => (THEMES as readonly string[]).includes(value);

/** Maps a theme stored by milestone 1 to the closed milestone 2 set; applied when reading, never persisted. */
export const toTheme = (stored: string): Theme => {
  const legacy = LEGACY_THEMES[stored];
  if (legacy) return legacy;
  return isTheme(stored) ? stored : 'other';
};
