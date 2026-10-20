import { describe, expect, it } from 'vitest';
import { formatScoreWithVariation } from '../../../src/domain/presentation/score-format.js';

describe('formatScoreWithVariation', () => {
  it('shows a zero variation as (0)', () => {
    expect(formatScoreWithVariation(77, 0)).toBe('77 (0)');
  });
  it('prefixes a positive variation with +', () => {
    expect(formatScoreWithVariation(77, 3)).toBe('77 (+3)');
  });
  it('uses the U+2212 minus sign for a negative variation', () => {
    expect(formatScoreWithVariation(77, -2)).toBe('77 (−2)');
  });
  it('hides a null variation', () => {
    expect(formatScoreWithVariation(77, null)).toBe('77');
  });
  it('shows the absence label for a null score', () => {
    expect(formatScoreWithVariation(null, 3)).toBe('non calculable');
  });
});
