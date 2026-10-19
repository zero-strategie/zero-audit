import type { SiteCheck } from '../../check.js';

const HTTP_SUCCESS_MIN = 200;
const HTTP_SUCCESS_MAX = 299;

export const check137: SiteCheck = {
  id: 137,
  severity: 'notice',
  theme: 'other',
  scope: 'site',
  label: 'Fichier llms.txt absent',
  run: ({ crawl }) => {
    const llms = crawl.siteFiles.find((file) => file.kind === 'llms');
    if (!llms) return [];
    const present =
      llms.status !== null && llms.status >= HTTP_SUCCESS_MIN && llms.status <= HTTP_SUCCESS_MAX;
    return present ? [] : [{ checkId: 137, pageUrl: null, info: {} }];
  },
};
