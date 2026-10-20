import { describe, expect, it } from 'vitest';
import { JsonLinesAuditEvents } from '../../src/infrastructure/json-lines-audit-events.js';

const NOW = Date.UTC(2026, 9, 20, 8, 30, 0);

const build = () => {
  const lines: string[] = [];
  const events = new JsonLinesAuditEvents(
    { write: (text) => lines.push(text) },
    { now: () => NOW },
  );
  return { events, lines };
};

describe('JsonLinesAuditEvents', () => {
  it('writes one JSON line per started event', () => {
    const { events, lines } = build();

    events.started({ snapshotId: 's1', rootUrl: 'https://exemple.com/' });

    expect(lines).toHaveLength(1);
    expect(lines[0]?.endsWith('\n')).toBe(true);
    expect(JSON.parse(lines[0] ?? '')).toEqual({
      event: 'audit.started',
      timestamp: '2026-10-20T08:30:00.000Z',
      snapshotId: 's1',
      rootUrl: 'https://exemple.com/',
    });
  });

  it('adds the page count and the health on finished', () => {
    const { events, lines } = build();

    events.finished({
      snapshotId: 's1',
      rootUrl: 'https://exemple.com/',
      pagesCount: 4,
      health: 77,
    });

    expect(JSON.parse(lines[0] ?? '')).toEqual({
      event: 'audit.finished',
      timestamp: '2026-10-20T08:30:00.000Z',
      snapshotId: 's1',
      rootUrl: 'https://exemple.com/',
      pagesCount: 4,
      health: 77,
    });
  });

  it('writes failed with the identity only', () => {
    const { events, lines } = build();

    events.failed({ snapshotId: 's1', rootUrl: 'https://exemple.com/' });

    expect(JSON.parse(lines[0] ?? '')).toEqual({
      event: 'audit.failed',
      timestamp: '2026-10-20T08:30:00.000Z',
      snapshotId: 's1',
      rootUrl: 'https://exemple.com/',
    });
  });
});
