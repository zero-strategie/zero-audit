const PARIS_DATE_TIME = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** A date for the French messages of the API, in Paris time: "01/01/2026 à 11:00". */
export const formatParisDateTime = (date: Date): string => {
  const parts = new Map(
    PARIS_DATE_TIME.formatToParts(date).map(({ type, value }) => [type, value] as const),
  );
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.get(type) ?? '';
  return `${part('day')}/${part('month')}/${part('year')} à ${part('hour')}:${part('minute')}`;
};
