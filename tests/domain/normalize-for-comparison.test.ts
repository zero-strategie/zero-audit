import { describe, expect, it } from 'vitest';
import { normalizeForComparison } from '../../src/domain/normalize-for-comparison.js';

describe('normalizeForComparison', () => {
  it('collapses whitespace, trims and lowercases', () => {
    expect(normalizeForComparison('  Accueil \n\t Zero  ')).toBe('accueil zero');
  });

  it('lowercases accented capitals with the French locale', () => {
    expect(normalizeForComparison('ÉCOLE')).toBe('école');
  });
});
