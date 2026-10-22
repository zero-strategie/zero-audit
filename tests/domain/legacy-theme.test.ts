import { describe, expect, it } from 'vitest';
import { toTheme } from '../../src/domain/legacy-theme.js';

const ANY_CHECK = 3;

describe('toTheme', () => {
  it.each([
    ['markup', 'on-page'],
    ['content', 'on-page'],
    ['status', 'crawlability'],
    ['links', 'linking'],
    ['https', 'https'],
    ['international', 'international'],
    ['whatever', 'other'],
  ])('maps %s to %s', (stored, expected) => {
    expect(toTheme(stored, ANY_CHECK)).toBe(expected);
  });

  it.each([45, 222])('keeps markup for the markup check %i', (checkId) => {
    expect(toTheme('markup', checkId)).toBe('markup');
  });
});
