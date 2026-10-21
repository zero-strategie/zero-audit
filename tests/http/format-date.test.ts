import { describe, expect, it } from 'vitest';
import { formatParisDateTime } from '../../src/http/format-date.js';

describe('formatParisDateTime', () => {
  it('writes a date in French, in Paris time (winter, UTC+1)', () => {
    expect(formatParisDateTime(new Date('2026-01-01T10:00:00.000Z'))).toBe('01/01/2026 à 11:00');
  });

  it('follows daylight saving time (summer, UTC+2)', () => {
    expect(formatParisDateTime(new Date('2026-07-01T10:00:00.000Z'))).toBe('01/07/2026 à 12:00');
  });
});
