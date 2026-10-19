import { describe, expect, it } from 'vitest';
import { runChecks } from '../../src/application/run-checks.js';
import { CheckRegistry } from '../../src/domain/check.js';
import { allChecks } from '../../src/domain/checks/index.js';
import { crawlOf, makePage, u } from '../support/check-fixtures.js';

describe('full check registry', () => {
  it('returns exactly the 17 checks of the milestone with catalogue severities', () => {
    const results = runChecks(crawlOf([makePage(u('a'))]), new CheckRegistry(allChecks));

    expect(results.map((r) => [r.checkId, r.severity])).toEqual([
      [1, 'error'],
      [2, 'error'],
      [3, 'error'],
      [6, 'error'],
      [8, 'error'],
      [15, 'error'],
      [101, 'warning'],
      [102, 'warning'],
      [103, 'warning'],
      [104, 'notice'],
      [105, 'warning'],
      [106, 'warning'],
      [117, 'warning'],
      [125, 'warning'],
      [203, 'notice'],
      [213, 'notice'],
      [1000, 'warning'],
    ]);
  });
});
