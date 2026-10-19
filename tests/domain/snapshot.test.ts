import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/domain/errors.js';
import { Snapshot } from '../../src/domain/snapshot.js';

const startedAt = new Date('2026-01-01T10:00:00Z');
const finishedAt = new Date('2026-01-01T10:05:00Z');

describe('Snapshot', () => {
  it('finishes a running snapshot and records the end date', () => {
    const snapshot = Snapshot.start({ id: 's1', startedAt, pagesLimit: 100 });

    const finished = snapshot.finish(finishedAt, 42);

    expect(finished.status).toBe('finished');
    expect(finished.finishedAt).toEqual(finishedAt);
    expect(finished.pagesCrawled).toBe(42);
  });

  it('starts running with no end date', () => {
    const snapshot = Snapshot.start({ id: 's1', startedAt, pagesLimit: 100 });

    expect(snapshot.status).toBe('running');
    expect(snapshot.finishedAt).toBeNull();
  });

  it('marks a running snapshot as failed', () => {
    const failed = Snapshot.start({ id: 's1', startedAt, pagesLimit: 100 }).fail(finishedAt);

    expect(failed.status).toBe('failed');
    expect(failed.finishedAt).toEqual(finishedAt);
  });

  it('refuses any transition from a finished snapshot', () => {
    const finished = Snapshot.start({ id: 's1', startedAt, pagesLimit: 100 }).finish(finishedAt, 1);

    expect(() => finished.finish(finishedAt, 1)).toThrow(DomainError);
    expect(() => finished.fail(finishedAt)).toThrow(DomainError);
  });

  it('refuses any transition from a failed snapshot', () => {
    const failed = Snapshot.start({ id: 's1', startedAt, pagesLimit: 100 }).fail(finishedAt);

    expect(() => failed.finish(finishedAt, 1)).toThrow(DomainError);
  });
});
