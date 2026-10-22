import { describe, expect, it } from 'vitest';
import { runChecks } from '../../src/application/run-checks.js';
import { CheckRegistry } from '../../src/domain/check.js';
import { allChecks } from '../../src/domain/checks/index.js';
import { crawlOf, makePage, u } from '../support/check-fixtures.js';

describe('full check registry', () => {
  it('returns exactly the 29 checks of the milestone with catalogue severities', () => {
    const results = runChecks(crawlOf([makePage(u('a'))]), new CheckRegistry(allChecks));

    expect(results.map((r) => [r.checkId, r.severity])).toEqual([
      [1, 'error'],
      [2, 'error'],
      [3, 'error'],
      [4, 'notice'],
      [6, 'error'],
      [7, 'error'],
      [8, 'error'],
      [9, 'error'],
      [11, 'error'],
      [15, 'error'],
      [33, 'error'],
      [101, 'warning'],
      [102, 'warning'],
      [103, 'warning'],
      [104, 'notice'],
      [105, 'warning'],
      [106, 'warning'],
      [109, 'warning'],
      [112, 'warning'],
      [117, 'warning'],
      [125, 'warning'],
      [137, 'notice'],
      [203, 'notice'],
      [205, 'notice'],
      [209, 'notice'],
      [212, 'notice'],
      [213, 'notice'],
      [214, 'notice'],
      [1000, 'warning'],
    ]);
  });
});
