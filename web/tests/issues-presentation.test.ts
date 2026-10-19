import { describe, expect, it } from 'vitest';
import type { IssueRow } from '../src/lib/api/types';
import { formatOccurrenceInfo, groupBySeverity, parseSeverityParam } from '../src/lib/issues';

const row = (checkId: number, severity: IssueRow['severity']): IssueRow => ({
  checkId,
  label: `check ${String(checkId)}`,
  severity,
  theme: 'on-page',
  count: 1,
  examined: 1,
  delta: 0,
  newCount: 0,
  fixedCount: 0,
});

describe('groupBySeverity', () => {
  it('groups rows by severity, errors first, keeping the API order', () => {
    const groups = groupBySeverity([
      row(3, 'notice'),
      row(1, 'error'),
      row(2, 'warning'),
      row(4, 'error'),
    ]);

    expect(groups.map(({ severity, rows }) => [severity, rows.map((r) => r.checkId)])).toEqual([
      ['error', [1, 4]],
      ['warning', [2]],
      ['notice', [3]],
    ]);
  });
  it('omits severities without rows', () => {
    expect(groupBySeverity([row(1, 'notice')]).map((g) => g.severity)).toEqual(['notice']);
  });
});

describe('parseSeverityParam', () => {
  it('accepts a known severity', () => {
    expect(parseSeverityParam('error')).toEqual({ kind: 'valid', severity: 'error' });
  });
  it('treats an absent parameter as no filter', () => {
    expect(parseSeverityParam(null)).toEqual({ kind: 'none' });
  });
  it('flags an unknown value as invalid', () => {
    expect(parseSeverityParam('autre')).toEqual({ kind: 'invalid', raw: 'autre' });
  });
});

describe('formatOccurrenceInfo', () => {
  it('describes an HTTP status', () => {
    expect(formatOccurrenceInfo({ status: 404 })).toBe('Code HTTP : 404');
  });
  it('describes a broken link with its target, status and error', () => {
    expect(formatOccurrenceInfo({ targetUrl: 'https://a.test/x', status: 500, error: null })).toBe(
      'Lien vers : https://a.test/x · Code HTTP : 500',
    );
  });
  it('describes lengths and counts', () => {
    expect(formatOccurrenceInfo({ length: 12 })).toBe('Longueur : 12 caractères');
    expect(formatOccurrenceInfo({ wordCount: 80 })).toBe('Nombre de mots : 80');
    expect(formatOccurrenceInfo({ h1Count: 2 })).toBe('Nombre de balises H1 : 2');
  });
  it('describes a URL variant by kind', () => {
    expect(formatOccurrenceInfo({ variantUrl: 'https://www.a.test/', kind: 'host' })).toBe(
      'Variante : https://www.a.test/ (www / sans www)',
    );
    expect(formatOccurrenceInfo({ variantUrl: 'https://a.test/x/', kind: 'trailing-slash' })).toBe(
      'Variante : https://a.test/x/ (slash final)',
    );
  });
  it('lists duplicates and source URLs', () => {
    expect(formatOccurrenceInfo({ duplicates: ['https://a.test/1', 'https://a.test/2'] })).toBe(
      'Doublons : https://a.test/1, https://a.test/2',
    );
    expect(formatOccurrenceInfo({ sourceUrl: 'https://a.test/s' })).toBe(
      'Page source : https://a.test/s',
    );
  });
  it('returns an empty text when there is no information', () => {
    expect(formatOccurrenceInfo({})).toBe('');
  });
  it('falls back to key and value for unknown fields', () => {
    expect(formatOccurrenceInfo({ foo: 'bar' })).toBe('foo : bar');
  });
});
