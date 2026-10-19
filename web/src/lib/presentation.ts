const NO_VALUE = '—';
const NOT_COMPUTABLE = 'Non calculable';

export const formatVariation = (variation: number | null): string => {
  if (variation === null) return NO_VALUE;
  return variation > 0 ? `+${String(variation)}` : String(variation);
};

export const formatThemeScore = (score: number | null): string =>
  score === null ? NOT_COMPUTABLE : String(score);

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
