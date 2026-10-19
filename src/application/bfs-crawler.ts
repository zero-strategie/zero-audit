import type { CrawlResult, Link, Page } from '../domain/crawl.js';
import { RootUnreachable } from '../domain/errors.js';
import { computeRedirectChain, MAX_REDIRECT_HOPS } from '../domain/redirect-chain.js';
import { isInternal, normalizeUrl, resolveUrl } from '../domain/url.js';
import { DiscoverSite } from './discover-site.js';
import { PoliteHttpClient } from './polite-http-client.js';
import type { Clock } from './ports/clock.js';
import type { HtmlParser, ParsedHtml } from './ports/html-parser.js';
import {
  isNetworkFailure,
  type HttpClient,
  type HttpResponse,
  type NetworkFailure,
} from './ports/http-client.js';
import type { RobotsPolicy, RobotsPolicyFactory } from './ports/robots-policy.js';
import type { SitemapReader } from './ports/sitemap-reader.js';
import type { Sleeper } from './ports/sleeper.js';

export interface BfsCrawlerDependencies {
  http: HttpClient;
  robotsFactory: RobotsPolicyFactory;
  sitemapReader: SitemapReader;
  htmlParser: HtmlParser;
  clock: Clock;
  sleeper: Sleeper;
}

export interface CrawlRequest {
  rootUrl: string;
  limit: number;
  delayMs: number;
  onProgress?: (crawled: number, limit: number) => void;
}

interface Fetched {
  url: string;
  depth: number;
  response: HttpResponse | NetworkFailure;
  responseTimeMs: number;
}

interface QueueItem {
  url: string;
  depth: number;
}

const RETAINED_HEADERS: ReadonlySet<string> = new Set([
  'content-type',
  'content-length',
  'location',
  'last-modified',
  'cache-control',
  'x-robots-tag',
  'strict-transport-security',
  'content-encoding',
]);
const HTML_CONTENT_TYPE = 'text/html';
const isHtmlContentType = (contentType: string | undefined): boolean =>
  contentType?.toLowerCase().startsWith(HTML_CONTENT_TYPE) ?? false;
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;
const HTTP_REDIRECT_MIN = 300;
const HTTP_REDIRECT_MAX = 399;

const retainedHeaders = (headers: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(headers).filter(([name]) => RETAINED_HEADERS.has(name)));

const isSuccess = (status: number): boolean => status >= HTTP_OK_MIN && status <= HTTP_OK_MAX;

export class BfsCrawler {
  constructor(private readonly dependencies: BfsCrawlerDependencies) {}

  crawl(request: CrawlRequest): Promise<CrawlResult> {
    return new CrawlRun(this.dependencies, request).execute();
  }
}

class CrawlRun {
  private readonly http: PoliteHttpClient;
  private readonly pages: Page[] = [];
  private readonly blockedPages: Page[] = [];
  private readonly links: Link[] = [];
  private readonly seen = new Set<string>();
  private readonly queue: QueueItem[] = [];
  private internalHost = '';

  constructor(
    private readonly dependencies: BfsCrawlerDependencies,
    private readonly request: CrawlRequest,
  ) {
    this.http = new PoliteHttpClient(dependencies.http, dependencies.sleeper, request.delayMs);
  }

  async execute(): Promise<CrawlResult> {
    const rootChain = await this.fetchRootRedirects();
    const finalRoot = rootChain[rootChain.length - 1] as Fetched;
    this.internalHost = new URL(finalRoot.url).hostname;

    const discovery = await new DiscoverSite({
      http: this.http,
      robotsFactory: this.dependencies.robotsFactory,
      sitemapReader: this.dependencies.sitemapReader,
    }).execute(finalRoot.url, this.internalHost);
    this.http.raiseDelayTo(discovery.robotsPolicy.crawlDelayMs ?? 0);

    for (const url of discovery.sitemapUrls) this.enqueue(url, 1);
    for (const fetched of rootChain) this.record(fetched);
    await this.crawlQueue(discovery.robotsPolicy);

    return {
      rootUrl: this.request.rootUrl,
      internalHost: this.internalHost,
      pages: this.withRedirectChains(),
      blockedPages: this.blockedPages,
      links: this.links,
      siteFiles: discovery.siteFiles,
      site: { robotsFound: discovery.robotsFound, sitemapFound: discovery.sitemapFound },
    };
  }

  /** Follows the root's redirects first: the final host defines which links are internal. */
  private async fetchRootRedirects(): Promise<Fetched[]> {
    const rootUrl = normalizeUrl(this.request.rootUrl);
    const maxRequests = Math.max(1, Math.min(this.request.limit, MAX_REDIRECT_HOPS + 1));
    const chain: Fetched[] = [];
    let next: QueueItem | null = { url: rootUrl, depth: 0 };
    this.seen.add(rootUrl);

    while (next !== null && chain.length < maxRequests) {
      const fetched = await this.fetch(next);
      if (isNetworkFailure(fetched.response)) {
        throw new RootUnreachable(rootUrl, fetched.response.kind);
      }
      chain.push(fetched);
      const target = this.redirectTargetOf(fetched);
      next =
        target !== null && !this.seen.has(target) ? { url: target, depth: next.depth + 1 } : null;
      if (next !== null) this.seen.add(next.url);
    }
    return chain;
  }

  /** Blocked URLs are recorded even once the limit is reached: they cost no request. */
  private async crawlQueue(robots: RobotsPolicy): Promise<void> {
    for (let index = 0; index < this.queue.length; index++) {
      const item = this.queue[index] as QueueItem;
      if (!robots.isAllowed(item.url)) {
        this.blockedPages.push(this.toBlockedPage(item));
        continue;
      }
      if (this.pages.length >= this.request.limit) continue;
      this.record(await this.fetch(item));
    }
  }

  private async fetch({ url, depth }: QueueItem): Promise<Fetched> {
    await this.http.waitTurn();
    const startedAt = this.dependencies.clock.now();
    const response = await this.http.send(url);
    return { url, depth, response, responseTimeMs: this.dependencies.clock.now() - startedAt };
  }

  private record(fetched: Fetched): void {
    const parsed = this.parseSuccessfulHtml(fetched);
    const page = this.toPage(fetched, parsed);
    this.pages.push(page);
    this.request.onProgress?.(this.pages.length, this.request.limit);

    const target = this.redirectTargetOf(fetched);
    if (target !== null) this.enqueue(target, fetched.depth + 1);
    if (parsed !== null) this.collectLinks(fetched, parsed);
  }

  private parseSuccessfulHtml({ url, response }: Fetched): ParsedHtml | null {
    if (isNetworkFailure(response) || !isSuccess(response.status)) return null;
    if (!isHtmlContentType(response.headers['content-type'])) return null;
    return this.dependencies.htmlParser.parse(response.body, url);
  }

  private toPage(
    { url, depth, response, responseTimeMs }: Fetched,
    parsed: ParsedHtml | null,
  ): Page {
    const common = {
      url,
      depth,
      redirectChain: [],
      responseTimeMs,
      title: parsed?.title ?? null,
      metaDescription: parsed?.metaDescription ?? null,
      h1: parsed?.h1 ?? [],
      wordCount: parsed?.wordCount ?? null,
      contentHash: parsed?.contentHash ?? null,
      blockedByRobots: false,
    };
    if (isNetworkFailure(response)) {
      return {
        ...common,
        status: null,
        error: response.kind,
        redirectTarget: null,
        headers: {},
        contentType: null,
        isHtml: false,
      };
    }
    const contentType = response.headers['content-type'] ?? null;
    return {
      ...common,
      status: response.status,
      error: null,
      redirectTarget: this.redirectTargetOf({ url, response }),
      headers: retainedHeaders(response.headers),
      contentType,
      isHtml: isHtmlContentType(contentType ?? undefined),
    };
  }

  private toBlockedPage({ url, depth }: QueueItem): Page {
    return {
      url,
      depth,
      status: null,
      error: null,
      redirectTarget: null,
      redirectChain: [],
      headers: {},
      responseTimeMs: 0,
      contentType: null,
      isHtml: false,
      title: null,
      metaDescription: null,
      h1: [],
      wordCount: null,
      contentHash: null,
      blockedByRobots: true,
    };
  }

  private redirectTargetOf({ url, response }: Pick<Fetched, 'url' | 'response'>): string | null {
    if (isNetworkFailure(response)) return null;
    const isRedirect = response.status >= HTTP_REDIRECT_MIN && response.status <= HTTP_REDIRECT_MAX;
    const location = response.headers['location'];
    return isRedirect && location !== undefined ? resolveUrl(location, url) : null;
  }

  private collectLinks({ url, depth }: Fetched, parsed: ParsedHtml): void {
    for (const raw of parsed.links) {
      const internal = isInternal(raw.targetUrl, this.internalHost);
      const isResource = raw.kind === 'resource';
      this.links.push({
        sourceUrl: url,
        targetUrl: raw.targetUrl,
        type: isResource ? 'resource' : internal ? 'internal' : 'external',
        rel: raw.rel,
        anchor: raw.anchor,
      });
      if (internal && !isResource) this.enqueue(raw.targetUrl, depth + 1);
    }
  }

  private enqueue(url: string, depth: number): void {
    if (this.seen.has(url) || !isInternal(url, this.internalHost)) return;
    this.seen.add(url);
    this.queue.push({ url, depth });
  }

  private withRedirectChains(): Page[] {
    const targets = new Map<string, string>();
    for (const { url, redirectTarget } of this.pages) {
      if (redirectTarget !== null) targets.set(url, redirectTarget);
    }
    return this.pages.map((page) => ({
      ...page,
      redirectChain: computeRedirectChain(page.url, targets),
    }));
  }
}
