import { describe, expect, it } from 'vitest';
import { THEMES } from '../../../src/domain/check.js';
import { allChecks } from '../../../src/domain/checks/index.js';

const EXPECTED_THEME_BY_CHECK_ID: Readonly<Record<number, string>> = {
  1: 'crawlability',
  2: 'crawlability',
  4: 'crawlability',
  9: 'crawlability',
  11: 'crawlability',
  33: 'crawlability',
  109: 'crawlability',
  212: 'crawlability',
  214: 'crawlability',
  125: 'crawlability',
  203: 'crawlability',
  205: 'https',
  137: 'other',
  3: 'on-page',
  6: 'on-page',
  15: 'on-page',
  101: 'on-page',
  102: 'on-page',
  103: 'on-page',
  104: 'on-page',
  105: 'on-page',
  106: 'on-page',
  112: 'on-page',
  117: 'on-page',
  8: 'linking',
  213: 'linking',
  1000: 'crawlability',
};

describe('check themes', () => {
  it('declares a closed theme on every check, following the H6 mapping check by check', () => {
    const actual = Object.fromEntries(allChecks.map((check) => [check.id, check.theme]));
    expect(actual).toEqual(EXPECTED_THEME_BY_CHECK_ID);
    for (const check of allChecks) expect(THEMES).toContain(check.theme);
  });
});
