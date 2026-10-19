import type { IssueRow, Severity } from './api/types';

export const SEVERITY_ORDER: readonly Severity[] = ['error', 'warning', 'notice'];

export interface SeverityGroup {
  severity: Severity;
  rows: IssueRow[];
}

export const groupBySeverity = (rows: IssueRow[]): SeverityGroup[] =>
  SEVERITY_ORDER.map((severity) => ({
    severity,
    rows: rows.filter((row) => row.severity === severity),
  })).filter(({ rows: grouped }) => grouped.length > 0);

export type SeverityParam =
  { kind: 'none' } | { kind: 'valid'; severity: Severity } | { kind: 'invalid'; raw: string };

export const parseSeverityParam = (raw: string | null): SeverityParam => {
  if (raw === null) return { kind: 'none' };
  const severity = SEVERITY_ORDER.find((candidate) => candidate === raw);
  return severity ? { kind: 'valid', severity } : { kind: 'invalid', raw };
};

const VARIANT_KIND_LABELS: Record<string, string> = {
  host: 'www / sans www',
  'trailing-slash': 'slash final',
};

const SEPARATOR = ' · ';

type Info = Record<string, unknown>;

const FIELD_FORMATTERS: [string, (value: unknown, info: Info) => string][] = [
  ['targetUrl', (value) => `Lien vers : ${String(value)}`],
  ['sourceUrl', (value) => `Page source : ${String(value)}`],
  [
    'variantUrl',
    (value, info) => {
      const kind = VARIANT_KIND_LABELS[String(info['kind'])];
      return kind ? `Variante : ${String(value)} (${kind})` : `Variante : ${String(value)}`;
    },
  ],
  ['status', (value) => `Code HTTP : ${String(value)}`],
  ['error', (value) => `Erreur : ${String(value)}`],
  ['length', (value) => `Longueur : ${String(value)} caractères`],
  ['wordCount', (value) => `Nombre de mots : ${String(value)}`],
  ['h1Count', (value) => `Nombre de balises H1 : ${String(value)}`],
  [
    'duplicates',
    (value) => `Doublons : ${Array.isArray(value) ? value.map(String).join(', ') : String(value)}`,
  ],
];

const CONSUMED_BY_OTHERS = new Set(['kind']);

const isPresent = (value: unknown): boolean => value !== null && value !== undefined;

export const formatOccurrenceInfo = (info: Info): string => {
  const known = new Set(FIELD_FORMATTERS.map(([key]) => key));
  const parts = FIELD_FORMATTERS.filter(([key]) => isPresent(info[key])).map(([key, format]) =>
    format(info[key], info),
  );
  const unknown = Object.entries(info)
    .filter(([key, value]) => !known.has(key) && !CONSUMED_BY_OTHERS.has(key) && isPresent(value))
    .map(
      ([key, value]) =>
        `${key} : ${typeof value === 'object' ? JSON.stringify(value) : (value as string)}`,
    );
  return [...parts, ...unknown].join(SEPARATOR);
};
