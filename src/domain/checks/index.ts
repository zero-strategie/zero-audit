import type { Check } from '../check.js';
import { pageChecks } from './page/index.js';
import { siteChecks } from './site/index.js';

export const allChecks: readonly Check[] = [...pageChecks, ...siteChecks];
