const NO_VALUE = '—';
const NOT_COMPUTABLE = 'Non calculable';

export const formatVariation = (variation: number | null): string => {
  if (variation === null) return NO_VALUE;
  return variation > 0 ? `+${String(variation)}` : String(variation);
};

const MINUS_SIGN = '\u2212';

const formatSignedScoreVariation = (variation: number): string => {
  if (variation > 0) return `+${String(variation)}`;
  if (variation < 0) return `${MINUS_SIGN}${String(-variation)}`;
  return '0';
};

export const formatScoreWithVariation = (
  score: number | null,
  variation: number | null,
): string => {
  if (score === null) return NOT_COMPUTABLE;
  if (variation === null) return String(score);
  return `${String(score)} (${formatSignedScoreVariation(variation)})`;
};

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

export const formatDateFr = (iso: string | null): string =>
  iso === null ? NO_VALUE : dateFormatter.format(new Date(iso));

export const formatStatus = (status: number | null): string =>
  status === null ? NO_VALUE : String(status);
