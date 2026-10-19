import type { PageGroup, SiteFileKind, Theme } from './api/types';

export const THEME_LABELS: Record<Theme, string> = {
  crawlability: 'Exploration',
  https: 'HTTPS',
  linking: 'Maillage',
  'on-page': 'Contenu des pages',
  other: 'Autres',
};

export const PAGE_GROUP_LABELS: Record<PageGroup, string> = {
  healthy: 'Pages saines',
  'have-issues': 'Pages avec problèmes',
  broken: 'Pages cassées',
  redirect: 'Redirections',
  blocked: 'Pages bloquées',
};

export const SITE_FILE_LABELS: Record<SiteFileKind, string> = {
  robots: 'robots.txt',
  sitemap: 'Sitemap',
  llms: 'llms.txt',
};

export const SEVERITY_LABELS = {
  error: 'Erreur',
  warning: 'Avertissement',
  notice: 'Notice',
} as const;

export const SEVERITY_GROUP_LABELS = {
  error: 'Erreurs',
  warning: 'Avertissements',
  notice: 'Notices',
} as const;
