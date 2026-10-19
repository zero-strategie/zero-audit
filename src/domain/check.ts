import type { CrawlResult, Page } from './crawl.js';
import { DomainError } from './errors.js';

export type Severity = 'error' | 'warning' | 'notice';

export interface IssueOccurrence {
  readonly checkId: number;
  readonly pageUrl: string | null;
  readonly info: Readonly<Record<string, unknown>>;
}

export interface CheckResult {
  readonly checkId: number;
  readonly severity: Severity;
  readonly theme: string;
  readonly count: number;
  readonly examined: number;
  readonly occurrences: readonly IssueOccurrence[];
}

export interface CheckContext {
  readonly crawl: CrawlResult;
}

interface CheckBase {
  readonly id: number;
  readonly severity: Severity;
  readonly theme: string;
  readonly label: string;
  run(context: CheckContext): readonly IssueOccurrence[];
}

/** Examines pages one by one: `applies` decides which pages count in `examined`. */
export interface PageCheck extends CheckBase {
  readonly scope: 'page';
  applies(page: Page, context: CheckContext): boolean;
}

/** Examines the whole site as a single unit: `examined` is always 1. */
export interface SiteCheck extends CheckBase {
  readonly scope: 'site';
}

export type Check = PageCheck | SiteCheck;

export class CheckRegistry {
  private readonly checksById = new Map<number, Check>();

  constructor(checks: readonly Check[]) {
    for (const check of checks) {
      if (this.checksById.has(check.id)) {
        throw new DomainError(`Check ${String(check.id)} is registered more than once`);
      }
      this.checksById.set(check.id, check);
    }
  }

  all(): readonly Check[] {
    return [...this.checksById.values()].sort((a, b) => a.id - b.id);
  }
}
