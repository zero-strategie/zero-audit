import { describe, expect, it } from 'vitest';
import { isValidHreflang } from '../../src/domain/iso-codes.js';

describe('isValidHreflang', () => {
  it.each([
    'en-GB',
    'fr',
    'zh-Hant-TW',
    'x-default',
    'X-Default',
    'EN-gb',
    'ZH-hant',
    'sr-Latn-RS',
  ])('accepts %s', (value) => {
    expect(isValidHreflang(value)).toBe(true);
  });

  it.each([
    'en-UK',
    'english',
    'fr_FR',
    '',
    'xx',
    'en-',
    'en-GB-',
    'zh-Abcd-TW',
    'en-GB-Latn',
    'x-defaults',
    ' fr',
    'en-ZZ',
    'iw',
    'fr-FX',
  ])('rejects %j', (value) => {
    expect(isValidHreflang(value)).toBe(false);
  });
});
