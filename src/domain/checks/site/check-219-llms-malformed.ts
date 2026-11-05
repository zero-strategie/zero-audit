import type { SiteCheck } from '../../check.js';
import type { FactValue } from '../../crawl.js';

const hasProblems = (value: FactValue | undefined): value is readonly FactValue[] =>
  Array.isArray(value) && value.length > 0;

export const check219: SiteCheck = {
  id: 219,
  severity: 'notice',
  theme: 'other',
  scope: 'site',
  label: 'Fichier llms.txt mal formé',
  run: ({ crawl }) => {
    const problems = crawl.siteFiles.find((file) => file.kind === 'llms')?.facts?.['problems'];
    return hasProblems(problems) ? [{ checkId: 219, pageUrl: null, info: { problems } }] : [];
  },
};
