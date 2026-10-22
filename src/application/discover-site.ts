import type { SiteFile, SiteFileKind } from '../domain/crawl.js';
import { isInternal, resolveUrl } from '../domain/url.js';
import {
  isNetworkFailure,
  type HttpClient,
  type HttpResponse,
  type NetworkFailure,
} from './ports/http-client.js';
import type { RobotsPolicy, RobotsPolicyFactory } from './ports/robots-policy.js';
import type { ParsedSitemap, SitemapReader } from './ports/sitemap-reader.js';

export interface SiteDiscovery {
  robotsPolicy: RobotsPolicy;
  robotsFound: boolean;
  sitemapFound: boolean;
  sitemapUrls: readonly string[];
  siteFiles: readonly SiteFile[];
}

export interface DiscoverSiteDependencies {
  http: HttpClient;
  robotsFactory: RobotsPolicyFactory;
  sitemapReader: SitemapReader;
}

const ROBOTS_PATH = '/robots.txt';
const LLMS_PATH = '/llms.txt';
const DEFAULT_SITEMAP_PATH = '/sitemap.xml';
const GZIP_EXTENSION = '.gz';
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;

const toSiteFile = (
  kind: SiteFileKind,
  url: string,
  response: HttpResponse | NetworkFailure,
): SiteFile =>
  isNetworkFailure(response)
    ? { kind, url, status: null, error: response.kind, facts: null }
    : { kind, url, status: response.status, error: null, facts: null };

const isGzipped = (url: string): boolean => new URL(url).pathname.endsWith(GZIP_EXTENSION);

export class DiscoverSite {
  constructor(private readonly dependencies: DiscoverSiteDependencies) {}

  async execute(rootUrl: string, internalHost: string): Promise<SiteDiscovery> {
    const origin = new URL(rootUrl).origin;
    const siteFiles: SiteFile[] = [];
    const { policy, found: robotsFound } = await this.readRobots(
      `${origin}${ROBOTS_PATH}`,
      siteFiles,
    );

    const declared = policy.sitemapUrls;
    const entryPoints = declared.length > 0 ? declared : [`${origin}${DEFAULT_SITEMAP_PATH}`];

    const urls = new Set<string>();
    let sitemapFound = false;
    for (const sitemapUrl of this.fetchable(entryPoints, internalHost)) {
      const sitemap = await this.readSitemap(sitemapUrl, siteFiles);
      if (sitemap === null) continue;
      sitemapFound = true;
      const leaves =
        sitemap.kind === 'urlset' ? [sitemap] : await this.readChildren(sitemap, internalHost);
      for (const leaf of leaves) this.collectPageUrls(leaf, sitemapUrl, internalHost, urls);
    }

    const llms = await this.dependencies.http.get(`${origin}${LLMS_PATH}`);
    siteFiles.push(toSiteFile('llms', `${origin}${LLMS_PATH}`, llms));

    return { robotsPolicy: policy, robotsFound, sitemapFound, sitemapUrls: [...urls], siteFiles };
  }

  private async readRobots(
    robotsUrl: string,
    siteFiles: SiteFile[],
  ): Promise<{ policy: RobotsPolicy; found: boolean }> {
    const { http, robotsFactory } = this.dependencies;
    const response = await http.get(robotsUrl);
    siteFiles.push(toSiteFile('robots', robotsUrl, response));
    if (isNetworkFailure(response) || !this.isSuccess(response.status)) {
      return { policy: robotsFactory.allowAll(), found: false };
    }
    return { policy: robotsFactory.fromRobotsTxt(robotsUrl, response.body), found: true };
  }

  /** Only first-level sitemaps are recorded as technical files; children are read silently. */
  private async readSitemap(url: string, siteFiles?: SiteFile[]): Promise<ParsedSitemap | null> {
    const response = await this.dependencies.http.get(url);
    siteFiles?.push(toSiteFile('sitemap', url, response));
    if (isNetworkFailure(response) || !this.isSuccess(response.status)) return null;
    return this.dependencies.sitemapReader.parse(response.body);
  }

  private async readChildren(index: ParsedSitemap, internalHost: string): Promise<ParsedSitemap[]> {
    const children: ParsedSitemap[] = [];
    for (const childUrl of this.fetchable(index.locs, internalHost)) {
      const child = await this.readSitemap(childUrl);
      if (child?.kind === 'urlset') children.push(child);
    }
    return children;
  }

  private fetchable(urls: readonly string[], internalHost: string): string[] {
    return urls.filter(
      (url) => URL.canParse(url) && isInternal(url, internalHost) && !isGzipped(url),
    );
  }

  private collectPageUrls(
    sitemap: ParsedSitemap,
    sitemapUrl: string,
    internalHost: string,
    into: Set<string>,
  ): void {
    for (const loc of sitemap.locs) {
      const url = resolveUrl(loc, sitemapUrl);
      if (url !== null && isInternal(url, internalHost)) into.add(url);
    }
  }

  private isSuccess(status: number): boolean {
    return status >= HTTP_OK_MIN && status <= HTTP_OK_MAX;
  }
}
