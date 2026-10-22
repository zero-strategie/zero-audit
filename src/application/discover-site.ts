import type { SiteFile, SiteFileKind } from '../domain/crawl.js';
import { validateLlmsTxt } from '../domain/llms-format.js';
import { validateRobotsTxt } from '../domain/robots-grammar.js';
import { isInternal, resolveUrl } from '../domain/url.js';
import {
  isNetworkFailure,
  type HttpClient,
  type HttpResponse,
  type NetworkFailure,
} from './ports/http-client.js';
import type { RobotsPolicy, RobotsPolicyFactory } from './ports/robots-policy.js';
import type { ParsedSitemap, SitemapReader } from './ports/sitemap-reader.js';
import { observeSitemap, toSitemapFacts, type SitemapObservation } from './sitemap-facts.js';

interface SitemapReading {
  file: SiteFile;
  sitemap: ParsedSitemap | null;
  observation: SitemapObservation | null;
}

interface ReadChild {
  sitemap: ParsedSitemap | null;
  observation: SitemapObservation | null;
}

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

const withFacts = (
  file: SiteFile,
  observation: SitemapObservation | null,
  children: readonly ReadChild[],
  isIndex = false,
): SiteFile => {
  if (observation === null) return file;
  const childObservations = children.flatMap((child) =>
    child.observation === null ? [] : [child.observation],
  );
  return { ...file, facts: toSitemapFacts(observation, childObservations, isIndex) };
};

const urlsetOf = ({ sitemap }: ReadChild): ParsedSitemap[] =>
  sitemap?.kind === 'urlset' ? [sitemap] : [];

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
      const { file, sitemap, observation } = await this.readSitemap(sitemapUrl);
      if (sitemap === null) {
        siteFiles.push(withFacts(file, observation, []));
        continue;
      }
      sitemapFound = true;
      const children =
        sitemap.kind === 'index' ? await this.readChildren(sitemap, internalHost) : [];
      siteFiles.push(withFacts(file, observation, children, sitemap.kind === 'index'));
      const leaves = sitemap.kind === 'urlset' ? [sitemap] : children.flatMap(urlsetOf);
      for (const leaf of leaves) this.collectPageUrls(leaf, sitemapUrl, internalHost, urls);
    }

    const llms = await this.dependencies.http.get(`${origin}${LLMS_PATH}`);
    siteFiles.push(this.toLlmsFile(`${origin}${LLMS_PATH}`, llms));

    return { robotsPolicy: policy, robotsFound, sitemapFound, sitemapUrls: [...urls], siteFiles };
  }

  private async readRobots(
    robotsUrl: string,
    siteFiles: SiteFile[],
  ): Promise<{ policy: RobotsPolicy; found: boolean }> {
    const { http, robotsFactory } = this.dependencies;
    const response = await http.get(robotsUrl);
    const robotsFile = toSiteFile('robots', robotsUrl, response);
    if (isNetworkFailure(response) || !this.isSuccess(response.status)) {
      siteFiles.push(robotsFile);
      return { policy: robotsFactory.allowAll(), found: false };
    }
    siteFiles.push({ ...robotsFile, facts: validateRobotsTxt(response.body) });
    return { policy: robotsFactory.fromRobotsTxt(robotsUrl, response.body), found: true };
  }

  private toLlmsFile(url: string, response: HttpResponse | NetworkFailure): SiteFile {
    const file = toSiteFile('llms', url, response);
    if (isNetworkFailure(response) || !this.isSuccess(response.status)) return file;
    return { ...file, facts: validateLlmsTxt(response.body) };
  }

  private async readSitemap(url: string): Promise<SitemapReading> {
    const response = await this.dependencies.http.get(url);
    const file = toSiteFile('sitemap', url, response);
    if (isNetworkFailure(response) || !this.isSuccess(response.status)) {
      return { file, sitemap: null, observation: null };
    }
    const read = this.dependencies.sitemapReader.parse(response.body);
    return { file, sitemap: read.sitemap, observation: observeSitemap(url, response, read) };
  }

  /** Children are read silently: only their facts are folded into the declared sitemap. */
  private async readChildren(index: ParsedSitemap, internalHost: string): Promise<ReadChild[]> {
    const children: ReadChild[] = [];
    for (const url of this.fetchable(index.locs, internalHost)) {
      const { sitemap, observation } = await this.readSitemap(url);
      children.push({ sitemap, observation });
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
