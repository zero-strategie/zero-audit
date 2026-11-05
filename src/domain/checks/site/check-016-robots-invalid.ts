import type { SiteCheck } from '../../check.js';
import type { FactValue } from '../../crawl.js';

const hasInvalidLines = (value: FactValue | undefined): value is readonly FactValue[] =>
  Array.isArray(value) && value.length > 0;

export const check16: SiteCheck = {
  id: 16,
  severity: 'error',
  theme: 'crawlability',
  scope: 'site',
  label: 'Fichier robots.txt contenant des lignes invalides',
  run: ({ crawl }) => {
    const lines = crawl.siteFiles.find((file) => file.kind === 'robots')?.facts?.['invalidLines'];
    return hasInvalidLines(lines) ? [{ checkId: 16, pageUrl: null, info: { lines } }] : [];
  },
};
