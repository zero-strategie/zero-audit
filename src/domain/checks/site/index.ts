import type { Check } from '../../check.js';
import { check6 } from './check-006-duplicate-title.js';
import { check7 } from './check-007-duplicate-content.js';
import { check8 } from './check-008-broken-internal-links.js';
import { check15 } from './check-015-duplicate-meta-description.js';
import { check1000 } from './check-1000-url-variants.js';
import { check16 } from './check-016-robots-invalid.js';
import { check17 } from './check-017-sitemap-invalid.js';
import { check124 } from './check-124-sitemap-undeclared.js';
import { check125 } from './check-125-sitemap-missing.js';
import { check137 } from './check-137-llms-missing.js';
import { check203 } from './check-203-robots-missing.js';
import { check205 } from './check-205-hsts-missing.js';
import { check213 } from './check-213-single-incoming-link.js';

export const siteChecks: readonly Check[] = [
  check6,
  check7,
  check8,
  check15,
  check16,
  check17,
  check124,
  check125,
  check137,
  check203,
  check205,
  check213,
  check1000,
];
