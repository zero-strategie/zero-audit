import { THEMES } from '../domain/check.js';
import {
  SCORE_NOT_COMPUTABLE,
  formatScoreWithVariation,
  formatSignedVariation,
} from '../domain/presentation/score-format.js';
import type { ScoreCard, ScoreWithVariation } from '../domain/scoring.js';

const summaryValue = ({ score, variation }: ScoreWithVariation): string =>
  formatScoreWithVariation(score, variation);

const comparisonValue = ({ score, variation }: ScoreWithVariation): string => {
  if (score === null) return SCORE_NOT_COMPUTABLE;
  if (variation === null) return `B ${String(score)} (A ${SCORE_NOT_COMPUTABLE})`;
  return `A ${String(score - variation)} → B ${String(score)} (${formatSignedVariation(variation)})`;
};

const lines = (card: ScoreCard, format: (score: ScoreWithVariation) => string): string[] => [
  `  Santé du site : ${format(card.health)}`,
  ...THEMES.map((theme) => `  ${theme} : ${format(card.themes[theme])}`),
];

export const summaryScoreLines = (card: ScoreCard): string[] => lines(card, summaryValue);

export const comparisonScoreLines = (card: ScoreCard): string[] => lines(card, comparisonValue);
