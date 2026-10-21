import { afterEach, describe, expect, it } from 'vitest';
import { BfsCrawler } from '../../src/application/bfs-crawler.js';
import {
  ProcessAuditQueue,
  type ProcessAuditQueueDependencies,
} from '../../src/application/process-audit-queue.js';
import type { Crawler, CrawlerRequest } from '../../src/application/ports/crawler.js';
import type { Sleeper } from '../../src/application/ports/sleeper.js';
import { RunAudit } from '../../src/application/run-audit.js';
import { CheckRegistry } from '../../src/domain/check.js';
import { allChecks } from '../../src/domain/checks/index.js';
import type { CrawlResult } from '../../src/domain/crawl.js';
import { CheerioHtmlParser } from '../../src/infrastructure/cheerio-html-parser.js';
import { FastXmlSitemapReader } from '../../src/infrastructure/fast-xml-sitemap-reader.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { RobotsParserAdapter } from '../../src/infrastructure/robots-parser-adapter.js';
import { SystemClock } from '../../src/infrastructure/system-clock.js';
import { UndiciHttpClient } from '../../src/infrastructure/undici-http-client.js';
import { makePage } from '../support/check-fixtures.js';
import { startFixtureServer, type FixtureServer } from '../support/fixture-server.js';

const ROOT = 'https://exemple.com/';
const START = 1_700_000_000_000;
const HOST = 'worker-host';

const crawlResult: CrawlResult = {
  rootUrl: ROOT,
  internalHost: 'exemple.com',
  pages: [makePage(ROOT), makePage('https://exemple.com/a')],
  blockedPages: [],
  links: [],
  siteFiles: [],
  hostProbe: null,
  slashProbes: [],
  site: { robotsFound: true, sitemapFound: true },
};

/** Virtual time: a sleep resolves when the pump moves the clock to its wake-up date. */
class VirtualTime implements Sleeper {
  now = START;
  readonly sleeps: number[] = [];
  private readonly waiters: { at: number; wake: () => void }[] = [];

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    this.sleeps.push(ms);
    return new Promise((resolve) => {
      const waiter = { at: this.now + ms, wake: resolve };
      this.waiters.push(waiter);
      signal?.addEventListener(
        'abort',
        () => {
          resolve();
        },
        { once: true },
      );
    });
  }

  /** Lets the worker run, jumping to the next wake-up each time everything is idle, until `done`. */
  async pump(done: () => boolean): Promise<void> {
    for (let turn = 0; turn < 10_000 && !done(); turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
      const next = this.waiters.sort((a, b) => a.at - b.at).shift();
      if (next) {
        this.now = Math.max(this.now, next.at);
        next.wake();
      }
    }
  }
}

class RecordingLogger {
  readonly lines: string[] = [];
  info(message: string): void {
    this.lines.push(message);
  }
  error(message: string): void {
    this.lines.push(message);
  }
}

class FakeCrawler implements Crawler {
  readonly requests: CrawlerRequest[] = [];
  onCrawl: (request: CrawlerRequest) => Promise<void> | void = () => undefined;
  async crawl(request: CrawlerRequest): Promise<CrawlResult> {
    this.requests.push(request);
    await this.onCrawl(request);
    return crawlResult;
  }
}

let server: FixtureServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const build = (
  options: {
    crawler?: Crawler;
    concurrency?: number;
    recover?: ProcessAuditQueueDependencies['recover'];
  } = {},
) => {
  const time = new VirtualTime();
  const queue = new InMemorySnapshotRepository();
  const projects = new InMemoryProjectRepository();
  const logger = new RecordingLogger();
  const crawler = options.crawler ?? new FakeCrawler();
  const clock = { now: () => time.now };
  const runAudit = new RunAudit({
    crawler,
    repository: queue,
    projects,
    registry: new CheckRegistry(allChecks),
    clock,
    events: { started: () => undefined, finished: () => undefined, failed: () => undefined },
  });
  const controller = new AbortController();
  const worker = new ProcessAuditQueue({
    queue,
    runAudit,
    recover: options.recover ?? { execute: () => Promise.resolve(0) },
    clock,
    sleeper: time,
    logger,
    hostname: HOST,
    concurrency: options.concurrency ?? 1,
    delayMs: 0,
  });
  const enqueue = async (rootUrl = ROOT, pagesLimit = 10) => {
    const project = await projects.findOrCreateByRootUrl({
      rootUrl,
      ownerId: null,
      createdAt: new Date(time.now),
    });
    return queue.enqueue(
      { projectId: project.id, launchedBy: null, pagesLimit, requestedAt: new Date(time.now) },
      () => Promise.resolve(),
    );
  };
  const statusOf = async (id: string) => (await queue.getById(id))?.snapshot.status;
  /** Runs the worker until the condition holds, then asks it to stop and waits for it. */
  const runUntil = async (done: () => boolean | Promise<boolean>) => {
    const running = worker.run(controller.signal);
    let reached = false;
    const watcher = (async () => {
      await time.pump(() => reached);
    })();
    for (let turn = 0; turn < 10_000 && !reached; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
      reached = await done();
    }
    controller.abort();
    await watcher;
    await running;
  };
  return { time, queue, logger, crawler, controller, enqueue, statusOf, runUntil };
};

describe('ProcessAuditQueue', () => {
  it('claims a queued audit, crawls the root of its project and finishes it', async () => {
    const crawler = new FakeCrawler();
    const kit = build({ crawler });
    const audit = await kit.enqueue();

    await kit.runUntil(async () => (await kit.statusOf(audit.id)) === 'finished');

    expect(crawler.requests).toHaveLength(1);
    expect(crawler.requests[0]).toMatchObject({ rootUrl: ROOT, limit: 10 });
    expect((await kit.queue.getById(audit.id))?.pages).toHaveLength(2);
  });

  it('fails an audit aimed at a private address when the guard is on', async () => {
    server = await startFixtureServer({ '/': { status: 200, body: '<html></html>' } });
    const crawler = new BfsCrawler({
      http: new UndiciHttpClient({
        clock: new SystemClock(),
        userAgent: 'test',
        blockPrivateAddresses: true,
      }),
      robotsFactory: new RobotsParserAdapter(),
      sitemapReader: new FastXmlSitemapReader(),
      htmlParser: new CheerioHtmlParser(),
      clock: new SystemClock(),
      sleeper: { sleep: () => Promise.resolve() },
    });
    const kit = build({ crawler });
    const audit = await kit.enqueue(server.baseUrl);

    await kit.runUntil(async () => (await kit.statusOf(audit.id)) === 'failed');

    expect(await kit.statusOf(audit.id)).toBe('failed');
  });

  it('waits 2 seconds on the sleeper when the queue is empty', async () => {
    const kit = build();

    await kit.runUntil(() => kit.time.sleeps.includes(2_000));

    expect(kit.time.sleeps).toContain(2_000);
  });

  it('records its presence every 15 seconds, whatever the crawl does', async () => {
    const kit = build();
    const recordedAt: number[] = [];
    const record = kit.queue.recordWorkerPresence.bind(kit.queue);
    kit.queue.recordWorkerPresence = (id, now) => {
      recordedAt.push(now.getTime() - START);
      return record(id, now);
    };

    await kit.runUntil(() => kit.time.now - START >= 30_000);

    expect(recordedAt.slice(0, 3)).toEqual([0, 15_000, 30_000]);
  });

  it('looks for stale audits at start then every 60 seconds', async () => {
    const scans: number[] = [];
    const kit = build({
      recover: {
        execute: () => {
          scans.push(kit.time.now - START);
          return Promise.resolve(0);
        },
      },
    });

    await kit.runUntil(() => kit.time.now - START >= 120_000);

    expect(scans.slice(0, 3)).toEqual([0, 60_000, 120_000]);
  });

  it('puts the audit back in the queue when the signal fires during attempt 1 of 2', async () => {
    const crawler = new FakeCrawler();
    const kit = build({ crawler });
    crawler.onCrawl = (request) => {
      kit.controller.abort();
      request.onProgress?.(1, request.limit);
    };
    const audit = await kit.enqueue();

    await kit.runUntil(() => crawler.requests.length > 0);

    expect(crawler.requests).toHaveLength(1);
    expect(await kit.statusOf(audit.id)).toBe('queued');
    expect(await kit.queue.queuePosition(audit.id)).toBe(1);
    expect((await kit.queue.getById(audit.id))?.snapshot.attempts).toBe(1);
  });

  it('fails the audit when the signal fires during attempt 2 of 2', async () => {
    const crawler = new FakeCrawler();
    const kit = build({ crawler });
    const audit = await kit.enqueue();
    await kit.queue.claimNext('previous', new Date(START));
    await kit.queue.requeue(audit.id, 1, new Date(START));
    crawler.onCrawl = (request) => {
      kit.controller.abort();
      request.onProgress?.(1, request.limit);
    };

    await kit.runUntil(() => crawler.requests.length > 0);

    expect(await kit.statusOf(audit.id)).toBe('failed');
  });

  it('writes the results to the end when the signal fires once the crawl is over', async () => {
    const crawler = new FakeCrawler();
    const kit = build({ crawler });
    crawler.onCrawl = () => {
      kit.controller.abort();
    };
    const audit = await kit.enqueue();

    await kit.runUntil(() => crawler.requests.length > 0);

    expect(await kit.statusOf(audit.id)).toBe('finished');
  });

  it('abandons an attempt taken over by another worker and keeps looping', async () => {
    const crawler = new FakeCrawler();
    const kit = build({ crawler });
    const audit = await kit.enqueue();
    crawler.onCrawl = async () => {
      if (crawler.requests.length === 1) await kit.queue.requeue(audit.id, 1, new Date(START));
    };

    await kit.runUntil(async () => (await kit.statusOf(audit.id)) === 'finished');

    expect(crawler.requests).toHaveLength(2);
    expect((await kit.queue.getById(audit.id))?.pages).toHaveLength(2);
  });

  it('processes two audits in parallel under distinct worker identifiers', async () => {
    const crawler = new FakeCrawler();
    const kit = build({ crawler, concurrency: 2 });
    let inFlight = 0;
    let peak = 0;
    crawler.onCrawl = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      inFlight -= 1;
    };
    const first = await kit.enqueue();
    const second = await kit.enqueue('https://autre.com/');

    await kit.runUntil(
      async () =>
        (await kit.statusOf(first.id)) === 'finished' &&
        (await kit.statusOf(second.id)) === 'finished',
    );

    expect(peak).toBe(2);
    expect(await kit.queue.getWorkerPresence(`${HOST}-1`)).not.toBeNull();
    expect(await kit.queue.getWorkerPresence(`${HOST}-2`)).not.toBeNull();
  });

  it('fails the audit on an unexpected crawler error and goes on with the next one', async () => {
    const crawler = new FakeCrawler();
    const kit = build({ crawler });
    crawler.onCrawl = () => {
      if (crawler.requests.length === 1) throw new Error('boom contact@exemple.com');
    };
    const first = await kit.enqueue();
    kit.time.now += 1;
    const second = await kit.enqueue('https://autre.com/');

    await kit.runUntil(async () => (await kit.statusOf(second.id)) === 'finished');

    expect(await kit.statusOf(first.id)).toBe('failed');
  });

  it('logs only the snapshot, status, attempt and duration', async () => {
    const crawler = new FakeCrawler();
    crawler.onCrawl = () => {
      throw new Error('boom contact@exemple.com');
    };
    const kit = build({ crawler });
    const audit = await kit.enqueue();

    await kit.runUntil(async () => (await kit.statusOf(audit.id)) === 'failed');

    expect(kit.logger.lines).toEqual([`audit ${audit.id} status=failed attempt=1 durationMs=0`]);
  });
});
