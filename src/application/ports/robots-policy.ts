export interface RobotsPolicy {
  isAllowed(url: string): boolean;
  readonly crawlDelayMs: number | null;
  readonly sitemapUrls: readonly string[];
}

export interface RobotsPolicyFactory {
  fromRobotsTxt(robotsUrl: string, content: string): RobotsPolicy;
  allowAll(): RobotsPolicy;
}
