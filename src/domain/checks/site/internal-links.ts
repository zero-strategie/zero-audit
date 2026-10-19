import type { Link } from '../../crawl.js';

export const internalLinks = (links: readonly Link[]): Link[] =>
  links.filter((link) => link.type === 'internal');
