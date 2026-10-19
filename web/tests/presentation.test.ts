import { describe, expect, it } from 'vitest';
import { formatDateFr, formatStatus, formatVariation } from '../src/lib/presentation';

describe('formatVariation', () => {
  it('prefixes a positive variation with +', () => {
    expect(formatVariation(2)).toBe('+2');
  });
  it('keeps the sign of a negative variation', () => {
    expect(formatVariation(-3)).toBe('-3');
  });
  it('shows zero without sign', () => {
    expect(formatVariation(0)).toBe('0');
  });
  it('shows a dash when there is no variation', () => {
    expect(formatVariation(null)).toBe('—');
  });
});

describe('formatDateFr', () => {
  it('formats an ISO date as dd/mm/yyyy in Paris time', () => {
    expect(formatDateFr('2026-03-05T10:00:00.000Z')).toBe('05/03/2026');
  });
  it('shows a dash when there is no date', () => {
    expect(formatDateFr(null)).toBe('—');
  });
});

describe('formatStatus', () => {
  it('shows the HTTP status or a dash when the request failed', () => {
    expect(formatStatus(404)).toBe('404');
    expect(formatStatus(null)).toBe('—');
  });
});
