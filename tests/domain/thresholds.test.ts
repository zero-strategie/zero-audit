import { describe, expect, it } from 'vitest';
import { LOW_WORD_COUNT, TITLE_MAX_LENGTH, TITLE_MIN_LENGTH } from '../../src/domain/thresholds.js';

describe('thresholds', () => {
  it('exposes the title and word count thresholds', () => {
    expect(TITLE_MIN_LENGTH).toBe(30);
    expect(TITLE_MAX_LENGTH).toBe(60);
    expect(LOW_WORD_COUNT).toBe(200);
  });
});
