import type { CrawlResult } from '../../domain/crawl.js';

export interface CrawlerRequest {
  rootUrl: string;
  limit: number;
  delayMs: number;
  onProgress?: (crawled: number, limit: number) => void;
}

export interface Crawler {
  crawl(request: CrawlerRequest): Promise<CrawlResult>;
}
