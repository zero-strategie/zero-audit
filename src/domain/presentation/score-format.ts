export const MINUS_SIGN = '−';
export const SCORE_NOT_COMPUTABLE = 'non calculable';

export const formatSignedVariation = (variation: number): string => {
  if (variation > 0) return `+${String(variation)}`;
  if (variation < 0) return `${MINUS_SIGN}${String(-variation)}`;
  return '0';
};

export const formatScoreWithVariation = (
  score: number | null,
  variation: number | null,
): string => {
  if (score === null) return SCORE_NOT_COMPUTABLE;
  if (variation === null) return String(score);
  return `${String(score)} (${formatSignedVariation(variation)})`;
};
