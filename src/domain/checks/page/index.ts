import type { PageCheck } from '../../check.js';
import { check1 } from './check-001-5xx.js';
import { check2 } from './check-002-4xx.js';
import { check3 } from './check-003-title-missing.js';
import { check4 } from './check-004-blocked-by-robots.js';
import { check9 } from './check-009-timeout.js';
import { check11 } from './check-011-unreachable.js';
import { check26 } from './check-026-http-page.js';
import { check31 } from './check-031-http-link-on-https.js';
import { check33 } from './check-033-redirect-chain.js';
import { check38 } from './check-038-canonical-to-error.js';
import { check101 } from './check-101-title-too-short.js';
import { check102 } from './check-102-title-too-long.js';
import { check103 } from './check-103-h1-missing.js';
import { check104 } from './check-104-h1-multiple.js';
import { check105 } from './check-105-h1-equals-title.js';
import { check106 } from './check-106-meta-description-missing.js';
import { check108 } from './check-108-too-many-links.js';
import { check109 } from './check-109-temporary-redirect.js';
import { check112 } from './check-112-low-text-ratio.js';
import { check113 } from './check-113-too-many-parameters.js';
import { check117 } from './check-117-low-word-count.js';
import { check122 } from './check-122-underscore-in-url.js';
import { check123 } from './check-123-internal-nofollow.js';
import { check136 } from './check-136-url-too-long.js';
import { check201 } from './check-201-url-over-200.js';
import { check202 } from './check-202-external-nofollow.js';
import { check209 } from './check-209-x-robots-noindex.js';
import { check212 } from './check-212-deep-page.js';
import { check214 } from './check-214-permanent-redirect.js';
import { check215 } from './check-215-linked-resource.js';
import { check216 } from './check-216-empty-anchor.js';
import { check217 } from './check-217-generic-anchor.js';

export const pageChecks: readonly PageCheck[] = [
  check1,
  check2,
  check3,
  check4,
  check9,
  check11,
  check26,
  check31,
  check33,
  check38,
  check101,
  check102,
  check103,
  check104,
  check105,
  check106,
  check108,
  check109,
  check112,
  check113,
  check117,
  check122,
  check123,
  check136,
  check201,
  check202,
  check209,
  check212,
  check214,
  check215,
  check216,
  check217,
];
