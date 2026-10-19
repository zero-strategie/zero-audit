import { describe, expect, it } from 'vitest';
import { toTheme } from '../../src/domain/legacy-theme.js';

describe('toTheme', () => {
  it.each([
    ['markup', 'on-page'],
    ['content', 'on-page'],
    ['status', 'crawlability'],
    ['links', 'linking'],
    ['https', 'https'],
    ['whatever', 'other'],
  ])('maps %s to %s', (stored, expected) => {
    expect(toTheme(stored)).toBe(expected);
  });
});
