import type { SiteCheck } from '../../check.js';
import { isSuccess } from '../page/page-predicates.js';

const HSTS_HEADER = 'strict-transport-security';
const HOME_DEPTH = 0;

export const check205: SiteCheck = {
  id: 205,
  severity: 'notice',
  theme: 'https',
  scope: 'site',
  label: 'Protocole HSTS non activé',
  run: ({ crawl }) => {
    const home = crawl.pages.find((page) => page.depth === HOME_DEPTH);
    if (!home || !home.url.startsWith('https:') || !isSuccess(home)) return [];
    if (HSTS_HEADER in home.headers) return [];
    return [{ checkId: 205, pageUrl: home.url, info: {} }];
  },
};
