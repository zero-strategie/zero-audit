import { randomUUID } from 'node:crypto';
import type {
  SnapshotDetails,
  SnapshotRepository,
} from '../application/ports/snapshot-repository.js';
import type { CheckResult } from '../domain/check.js';
import type { Link, Page, SiteFile } from '../domain/crawl.js';
import { SnapshotNotFound } from '../domain/errors.js';
import { Snapshot } from '../domain/snapshot.js';

interface Stored {
  snapshot: Snapshot;
  pages: Page[];
  links: Link[];
  checkResults: CheckResult[];
  siteFiles: SiteFile[];
}

const bySiteFileOrder = (a: SiteFile, b: SiteFile): number =>
  a.kind === b.kind ? Number(a.url > b.url) - Number(a.url < b.url) : Number(a.kind > b.kind) - Number(a.kind < b.kind);

export class InMemorySnapshotRepository implements SnapshotRepository {
  private readonly stored = new Map<string, Stored>();

  create(input: { projectId: string; pagesLimit: number; startedAt: Date }): Promise<Snapshot> {
    const snapshot = Snapshot.start({ id: randomUUID(), ...input });
    this.stored.set(snapshot.id, { snapshot, pages: [], links: [], checkResults: [], siteFiles: [] });
    return Promise.resolve(snapshot);
  }

  addPages(id: string, pages: readonly Page[]): Promise<void> {
    return this.write(id, (entry) => entry.pages.push(...pages));
  }

  addLinks(id: string, links: readonly Link[]): Promise<void> {
    return this.write(id, (entry) => entry.links.push(...links));
  }

  addSiteFiles(id: string, files: readonly SiteFile[]): Promise<void> {
    return this.write(id, (entry) => entry.siteFiles.push(...files));
  }

  addCheckResults(id: string, results: readonly CheckResult[]): Promise<void> {
    return this.write(id, (entry) => entry.checkResults.push(...results));
  }

  finish(id: string, input: { finishedAt: Date; pagesCrawled: number }): Promise<void> {
    return this.write(id, (entry) => {
      entry.snapshot = entry.snapshot.finish(input.finishedAt, input.pagesCrawled);
    });
  }

  fail(id: string, finishedAt: Date): Promise<void> {
    return this.write(id, (entry) => {
      entry.snapshot = entry.snapshot.fail(finishedAt);
    });
  }

  getById(id: string): Promise<SnapshotDetails | null> {
    const entry = this.stored.get(id);
    if (!entry) return Promise.resolve(null);
    return Promise.resolve({
      snapshot: entry.snapshot,
      pages: [...entry.pages],
      links: [...entry.links],
      checkResults: [...entry.checkResults],
      siteFiles: [...entry.siteFiles].sort(bySiteFileOrder),
    });
  }

  listByProject(projectId: string): Promise<readonly Snapshot[]> {
    const snapshots = [...this.stored.values()]
      .map(({ snapshot }) => snapshot)
      .filter((snapshot) => snapshot.projectId === projectId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return Promise.resolve(snapshots);
  }

  async findPreviousFinished(projectId: string, beforeStartedAt: Date): Promise<Snapshot | null> {
    const snapshots = await this.listByProject(projectId);
    return (
      snapshots.find(
        (snapshot) =>
          snapshot.status === 'finished' &&
          snapshot.startedAt.getTime() < beforeStartedAt.getTime(),
      ) ?? null
    );
  }

  private write(id: string, mutate: (entry: Stored) => void): Promise<void> {
    try {
      const entry = this.stored.get(id);
      if (!entry) throw new SnapshotNotFound(id);
      entry.snapshot.assertWritable();
      mutate(entry);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
