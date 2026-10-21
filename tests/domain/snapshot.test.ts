import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/domain/errors.js';
import { MAX_ATTEMPTS, Snapshot } from '../../src/domain/snapshot.js';

const startedAt = new Date('2026-01-01T10:00:00Z');
const finishedAt = new Date('2026-01-01T10:05:00Z');

describe('Snapshot', () => {
  it('finishes a running snapshot and records the end date', () => {
    const snapshot = Snapshot.start({ id: 's1', projectId: 'p1', startedAt, pagesLimit: 100 });

    const finished = snapshot.finish(finishedAt, 42);

    expect(finished.status).toBe('finished');
    expect(finished.finishedAt).toEqual(finishedAt);
    expect(finished.pagesCrawled).toBe(42);
  });

  it('starts running with no end date', () => {
    const snapshot = Snapshot.start({ id: 's1', projectId: 'p1', startedAt, pagesLimit: 100 });

    expect(snapshot.status).toBe('running');
    expect(snapshot.finishedAt).toBeNull();
  });

  it('marks a running snapshot as failed', () => {
    const failed = Snapshot.start({ id: 's1', projectId: 'p1', startedAt, pagesLimit: 100 }).fail(
      finishedAt,
    );

    expect(failed.status).toBe('failed');
    expect(failed.finishedAt).toEqual(finishedAt);
  });

  it('refuses any transition from a finished snapshot', () => {
    const finished = Snapshot.start({
      id: 's1',
      projectId: 'p1',
      startedAt,
      pagesLimit: 100,
    }).finish(finishedAt, 1);

    expect(() => finished.finish(finishedAt, 1)).toThrow(DomainError);
    expect(() => finished.fail(finishedAt)).toThrow(DomainError);
  });

  it('refuses any transition from a failed snapshot', () => {
    const failed = Snapshot.start({ id: 's1', projectId: 'p1', startedAt, pagesLimit: 100 }).fail(
      finishedAt,
    );

    expect(() => failed.finish(finishedAt, 1)).toThrow(DomainError);
  });
});

describe('Snapshot project', () => {
  it('keeps its project id through its lifecycle', () => {
    const started = Snapshot.start({ id: 's1', projectId: 'p1', startedAt, pagesLimit: 100 });
    expect(started.projectId).toBe('p1');
    expect(started.finish(finishedAt, 1).projectId).toBe('p1');
    expect(started.fail(finishedAt).projectId).toBe('p1');
  });
});

describe('Snapshot audit queue lifecycle', () => {
  const queuedAt = new Date('2026-01-01T09:59:00Z');
  const enqueue = (): Snapshot =>
    Snapshot.enqueue({ id: 's1', projectId: 'p1', startedAt: queuedAt, pagesLimit: 100 });

  it('is created queued with no attempt and no heartbeat', () => {
    const snapshot = enqueue();

    expect(snapshot.status).toBe('queued');
    expect(snapshot.attempts).toBe(0);
    expect(snapshot.queuedAt).toEqual(queuedAt);
    expect(snapshot.heartbeatAt).toBeNull();
    expect(snapshot.startedAt).toEqual(queuedAt);
  });

  it('runs when claimed and counts the attempt', () => {
    const claimed = enqueue().claim(startedAt);

    expect(claimed.status).toBe('running');
    expect(claimed.attempts).toBe(1);
    expect(claimed.heartbeatAt).toEqual(startedAt);
  });

  it('goes back to the queue after a first interruption, keeping its original queue date', () => {
    const requeued = enqueue().claim(startedAt).interrupt(finishedAt);

    expect(requeued.status).toBe('queued');
    expect(requeued.queuedAt).toEqual(queuedAt);
    expect(requeued.attempts).toBe(1);
    expect(requeued.heartbeatAt).toBeNull();
  });

  it('records progress and a heartbeat while running', () => {
    const beaten = enqueue().claim(startedAt).beat(finishedAt, 12);

    expect(beaten).toMatchObject({ pagesCrawled: 12, heartbeatAt: finishedAt, status: 'running' });
    expect(() => enqueue().beat(finishedAt, 1)).toThrow(DomainError);
  });

  it('forgets the progress of an interrupted attempt', () => {
    const progressed = enqueue().claim(startedAt).beat(finishedAt, 5).requeue();

    expect(progressed.pagesCrawled).toBe(0);
  });

  it('fails after the last allowed attempt is interrupted', () => {
    const last = enqueue().claim(startedAt).interrupt(finishedAt).claim(startedAt);

    const failed = last.interrupt(finishedAt);

    expect(last.attempts).toBe(MAX_ATTEMPTS);
    expect(failed.status).toBe('failed');
    expect(failed.finishedAt).toEqual(finishedAt);
  });

  it.each([
    [
      'finished',
      Snapshot.start({ id: 's', projectId: 'p', startedAt, pagesLimit: 1 }).finish(finishedAt, 1),
    ],
    [
      'failed',
      Snapshot.start({ id: 's', projectId: 'p', startedAt, pagesLimit: 1 }).fail(finishedAt),
    ],
  ])('refuses to claim or requeue a %s snapshot', (_status, snapshot) => {
    expect(() => snapshot.claim(startedAt)).toThrow(DomainError);
    expect(() => snapshot.requeue()).toThrow(DomainError);
  });

  it('is not writable while queued', () => {
    expect(() => {
      enqueue().assertWritable();
    }).toThrow(DomainError);
  });

  it('exports the worker timings and no longer the orphan age', async () => {
    const module = await import('../../src/domain/snapshot.js');

    expect(module.MAX_ATTEMPTS).toBe(2);
    expect(module.HEARTBEAT_STALE_MS).toBe(120_000);
    expect(module.WORKER_HEALTH_MAX_AGE_MS).toBe(60_000);
    expect(module.EMPTY_QUEUE_POLL_MS).toBe(2_000);
    expect(module.HEARTBEAT_EVERY_PAGES).toBe(5);
    expect(module.HEARTBEAT_EVERY_MS).toBe(2_000);
    expect(module.WORKER_PRESENCE_EVERY_MS).toBe(15_000);
    expect(module.RECOVERY_EVERY_MS).toBe(60_000);
    expect('ORPHAN_AUDIT_MAX_AGE_MS' in module).toBe(false);
  });
});
