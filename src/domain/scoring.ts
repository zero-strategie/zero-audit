import { THEMES, type CheckResult, type Severity, type Theme } from './check.js';

export const SEVERITY_WEIGHTS: Readonly<Record<Severity, number>> = {
  error: 3,
  warning: 1,
  notice: 0,
};

const MAX_SCORE = 100;

export type ThemeScores = Readonly<Record<Theme, number | null>>;

/** Share of examined items that are not flagged, between 0 and 1. */
export const passRate = ({ count, examined }: CheckResult): number =>
  1 - Math.min(1, count / Math.max(1, examined));

/** Weighted pass rate on a 0-100 scale; null when no weighted check examined anything. */
const weightedScore = (results: readonly CheckResult[]): number | null => {
  const scored = results.filter((result) => result.examined > 0);
  const totalWeight = scored.reduce((sum, { severity }) => sum + SEVERITY_WEIGHTS[severity], 0);
  if (totalWeight === 0) return null;
  const weightedPass = scored.reduce(
    (sum, result) => sum + SEVERITY_WEIGHTS[result.severity] * passRate(result),
    0,
  );
  return (MAX_SCORE * weightedPass) / totalWeight;
};

export const computeHealth = (results: readonly CheckResult[]): number | null =>
  weightedScore(results);

export const computeThemeScores = (results: readonly CheckResult[]): ThemeScores =>
  Object.fromEntries(
    THEMES.map((theme) => [theme, weightedScore(results.filter((result) => result.theme === theme))]),
  ) as ThemeScores;

export const roundScore = (score: number | null): number | null =>
  score === null ? null : Math.round(score);

/** Difference of the rounded scores, so that the displayed figures always add up. */
export const scoreVariation = (
  previous: number | null | undefined,
  current: number | null,
): number | null => {
  const previousRounded = roundScore(previous ?? null);
  const currentRounded = roundScore(current);
  if (previousRounded === null || currentRounded === null) return null;
  return currentRounded - previousRounded;
};
