import robotsParserModule from 'robots-parser';
import type { RobotsPolicy, RobotsPolicyFactory } from '../application/ports/robots-policy.js';
import { ROBOTS_TOKEN } from './user-agent.js';

const MS_PER_SECOND = 1000;

interface ParsedRobots {
  isAllowed(url: string, userAgent: string): boolean | undefined;
  getCrawlDelay(userAgent: string): number | undefined;
  getSitemaps(): string[];
}

// robots-parser ships CJS typings whose default export is not callable under NodeNext.
const robotsParser = robotsParserModule as unknown as (
  robotsUrl: string,
  content: string,
) => ParsedRobots;

export class RobotsParserAdapter implements RobotsPolicyFactory {
  fromRobotsTxt(robotsUrl: string, content: string): RobotsPolicy {
    const robots = robotsParser(robotsUrl, content);
    const delaySeconds = robots.getCrawlDelay(ROBOTS_TOKEN);
    return {
      isAllowed: (url) => robots.isAllowed(url, ROBOTS_TOKEN) ?? true,
      crawlDelayMs: delaySeconds === undefined ? null : delaySeconds * MS_PER_SECOND,
      sitemapUrls: robots.getSitemaps(),
    };
  }

  allowAll(): RobotsPolicy {
    return { isAllowed: () => true, crawlDelayMs: null, sitemapUrls: [] };
  }
}
