import type { IssueOccurrence, PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import { normalizeUrl } from '../../url.js';
import { hreflangAlternatesOf, type HreflangAlternate } from './hreflang-facts.js';

interface HreflangConflict {
  readonly lang: string;
  readonly urls: readonly string[];
}

const safeNormalize = (url: string): string => {
  try {
    return normalizeUrl(url);
  } catch {
    return url;
  }
};

const findConflicts = (alternates: readonly HreflangAlternate[]): HreflangConflict[] => {
  const urlsByLang = new Map<string, Set<string>>();
  for (const { lang, url } of alternates) {
    const key = lang.toLowerCase();
    urlsByLang.set(key, (urlsByLang.get(key) ?? new Set()).add(safeNormalize(url)));
  }
  return [...urlsByLang]
    .filter(([, urls]) => urls.size > 1)
    .map(([lang, urls]) => ({ lang, urls: [...urls] }));
};

const lacksSelfReference = (page: Page, alternates: readonly HreflangAlternate[]): boolean => {
  const selves = new Set([safeNormalize(page.url)]);
  if (page.canonical !== null) selves.add(safeNormalize(page.canonical));
  return !alternates.some(({ url }) => selves.has(safeNormalize(url)));
};

/** Contradictory or self-less hreflang sets make engines drop the whole annotation cluster. */
export const check24: PageCheck = {
  id: 24,
  severity: 'error',
  theme: 'international',
  scope: 'page',
  label: 'Conflits hreflang dans la page',
  applies: (page) => hreflangAlternatesOf(page).length > 0,
  run: ({ crawl }) =>
    crawl.pages.flatMap((page): IssueOccurrence[] => {
      const alternates = hreflangAlternatesOf(page);
      if (alternates.length === 0) return [];
      const conflicts = findConflicts(alternates);
      const missingSelf = lacksSelfReference(page, alternates);
      if (conflicts.length === 0 && !missingSelf) return [];
      return [
        {
          checkId: 24,
          pageUrl: page.url,
          info: {
            reasons: [
              ...(conflicts.length > 0 ? ['conflict'] : []),
              ...(missingSelf ? ['missing-self-reference'] : []),
            ],
            ...(conflicts.length > 0 ? { conflicts } : {}),
          },
        },
      ];
    }),
};
