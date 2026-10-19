import type { PageCheck } from '../../check.js';
import { normalizeUrl } from '../../url.js';
import { isHtml2xx } from '../page/page-predicates.js';
import { internalLinks } from './internal-links.js';

export const check213: PageCheck = {
  id: 213,
  severity: 'notice',
  theme: 'links',
  scope: 'page',
  label: 'Page recevant un seul lien interne',
  applies: isHtml2xx,
  run: ({ crawl }) => {
    const sourcesByTarget = new Map<string, Set<string>>();
    for (const link of internalLinks(crawl.links)) {
      const targetUrl = normalizeUrl(link.targetUrl);
      if (link.sourceUrl === targetUrl) continue;
      const sources = sourcesByTarget.get(targetUrl) ?? new Set<string>();
      sources.add(link.sourceUrl);
      sourcesByTarget.set(targetUrl, sources);
    }
    return crawl.pages.filter(isHtml2xx).flatMap((page) => {
      const sources = [...(sourcesByTarget.get(page.url) ?? [])];
      const [sourceUrl] = sources;
      return sources.length === 1 && sourceUrl !== undefined
        ? [{ checkId: 213, pageUrl: page.url, info: { sourceUrl } }]
        : [];
    });
  },
};
