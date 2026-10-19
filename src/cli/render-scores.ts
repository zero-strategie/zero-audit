import { THEMES } from '../domain/check.js';
import type { ScoreCard, ScoreWithVariation } from '../domain/scoring.js';

const MAX_SCORE = 100;
const NOT_COMPUTABLE = 'non calculable';

const signed = (value: number): string => (value > 0 ? `+${String(value)}` : String(value));

const summaryValue = ({ score, variation }: ScoreWithVariation): string => {
  if (score === null) return NOT_COMPUTABLE;
  const base = `${String(score)} / ${String(MAX_SCORE)}`;
  return variation === null ? base : `${base} (${signed(variation)})`;
};

const comparisonValue = ({ score, variation }: ScoreWithVariation): string => {
  if (score === null) return NOT_COMPUTABLE;
  if (variation === null) return `B ${String(score)} (A ${NOT_COMPUTABLE})`;
  return `A ${String(score - variation)} → B ${String(score)} (Δ ${signed(variation)})`;
};

const lines = (
  card: ScoreCard,
  format: (score: ScoreWithVariation) => string,
): string[] => [
  `  Santé du site : ${format(card.health)}`,
  ...THEMES.map((theme) => `  ${theme} : ${format(card.themes[theme])}`),
];

export const summaryScoreLines = (card: ScoreCard): string[] => lines(card, summaryValue);

export const comparisonScoreLines = (card: ScoreCard): string[] => lines(card, comparisonValue);
