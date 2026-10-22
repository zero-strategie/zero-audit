import { describe, expect, it } from 'vitest';
import type { CheckResult, Severity, Theme } from '../../src/domain/check.js';
import {
  computeHealth,
  buildScoreCard,
  computeThemeScores,
  passRate,
  roundScore,
  scoreVariation,
} from '../../src/domain/scoring.js';

const result = (
  severity: Severity,
  count: number,
  examined: number,
  theme: Theme = 'on-page',
  checkId = 1,
): CheckResult => ({ checkId, severity, theme, count, examined, occurrences: [] });

describe('passRate', () => {
  it('is 0 and not negative when the count exceeds the examined items', () => {
    expect(passRate(result('error', 10, 4))).toBe(0);
  });

  it('is 1 when nothing is flagged', () => {
    expect(passRate(result('warning', 0, 4))).toBe(1);
  });
});

describe('computeHealth', () => {
  it('weights errors 3 and warnings 1 (81.25 for one error out of 4 and a clean warning)', () => {
    const health = computeHealth([result('error', 1, 4), result('warning', 0, 4, 'on-page', 2)]);
    expect(health).toBe(81.25);
    expect(roundScore(health)).toBe(81);
  });

  it('ignores checks that examined nothing', () => {
    expect(computeHealth([result('error', 0, 0), result('warning', 1, 2, 'on-page', 2)])).toBe(50);
  });

  it('is null when every check examined nothing', () => {
    expect(
      computeHealth([result('error', 0, 0), result('warning', 0, 0, 'on-page', 2)]),
    ).toBeNull();
  });

  it('is null when only notices were examined (zero total weight)', () => {
    expect(computeHealth([result('notice', 3, 4)])).toBeNull();
  });
});

describe('computeThemeScores', () => {
  it('scores each theme apart and gives null to themes without examined checks', () => {
    const scores = computeThemeScores([
      result('error', 1, 4, 'on-page'),
      result('error', 0, 2, 'linking', 8),
      result('notice', 2, 2, 'crawlability', 9),
    ]);
    expect(scores).toEqual({
      crawlability: null,
      https: null,
      international: null,
      linking: 100,
      markup: null,
      'on-page': 75,
      other: null,
    });
  });

  it('gives null to the https theme when the snapshot has no https check', () => {
    expect(computeThemeScores([result('error', 0, 1)]).https).toBeNull();
  });
});

describe('scoreVariation', () => {
  it('subtracts the rounded scores', () => {
    expect(roundScore(80.4)).toBe(80);
    expect(roundScore(81.6)).toBe(82);
    expect(scoreVariation(80.4, 81.6)).toBe(2);
  });

  it('is null when a score is null or there is no previous snapshot', () => {
    expect(scoreVariation(null, 80)).toBeNull();
    expect(scoreVariation(80, null)).toBeNull();
    expect(scoreVariation(undefined, 80)).toBeNull();
  });
});

describe('buildScoreCard', () => {
  it('exposes rounded scores with their variation against the previous results', () => {
    const previous = [result('error', 1, 5)];
    const current = [result('error', 1, 10)];
    const card = buildScoreCard(previous, current);
    expect(card.health).toEqual({ score: 90, variation: 10 });
    expect(card.themes['on-page']).toEqual({ score: 90, variation: 10 });
    expect(card.themes.https).toEqual({ score: null, variation: null });
  });

  it('has no variation without previous results', () => {
    expect(buildScoreCard(null, [result('error', 0, 1)]).health).toEqual({
      score: 100,
      variation: null,
    });
  });
});
