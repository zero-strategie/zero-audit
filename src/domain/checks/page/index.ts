import type { PageCheck } from '../../check.js';
import { check1 } from './check-001-5xx.js';
import { check2 } from './check-002-4xx.js';
import { check3 } from './check-003-title-missing.js';
import { check4 } from './check-004-blocked-by-robots.js';
import { check101 } from './check-101-title-too-short.js';
import { check102 } from './check-102-title-too-long.js';
import { check103 } from './check-103-h1-missing.js';
import { check104 } from './check-104-h1-multiple.js';
import { check105 } from './check-105-h1-equals-title.js';
import { check106 } from './check-106-meta-description-missing.js';
import { check112 } from './check-112-low-text-ratio.js';
import { check117 } from './check-117-low-word-count.js';

export const pageChecks: readonly PageCheck[] = [
  check1,
  check2,
  check3,
  check4,
  check101,
  check102,
  check103,
  check104,
  check105,
  check106,
  check112,
  check117,
];
