import type { Check, CheckContext, CheckRegistry, CheckResult } from '../domain/check.js';
import type { CrawlResult } from '../domain/crawl.js';

const countExamined = (check: Check, context: CheckContext): number =>
  check.scope === 'site'
    ? 1
    : context.crawl.pages.filter((page) => check.applies(page, context)).length;

export const runChecks = (crawl: CrawlResult, registry: CheckRegistry): CheckResult[] => {
  const context: CheckContext = { crawl };
  return registry.all().map((check) => {
    const occurrences = check.run(context);
    return {
      checkId: check.id,
      severity: check.severity,
      theme: check.theme,
      count: occurrences.length,
      examined: countExamined(check, context),
      occurrences,
    };
  });
};
