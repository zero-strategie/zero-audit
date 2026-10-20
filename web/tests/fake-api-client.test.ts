import { describe, expect, it } from 'vitest';
import { Conflict, NotFound } from '../src/lib/api/errors';
import { aStartedAudit, anAuditProgress, fakeApiClient } from './fake-api-client';

describe('fakeApiClient audit launch', () => {
  it('returns the configured answers of startAudit and getAuditProgress', async () => {
    const client = fakeApiClient({
      startAudit: () => Promise.resolve(aStartedAudit()),
      getAuditProgress: () => Promise.resolve(anAuditProgress({ pagesCrawled: 3 })),
    });

    expect(await client.startAudit({ url: 'https://e.com/', limit: 50 })).toEqual(aStartedAudit());
    expect((await client.getAuditProgress('s2')).pagesCrawled).toBe(3);
  });

  it('rejects with the configured errors', async () => {
    const client = fakeApiClient({
      startAudit: () => Promise.reject(new Conflict('busy')),
      getAuditProgress: () => Promise.reject(new NotFound('Snapshot')),
    });

    await expect(client.startAudit({ url: 'x', limit: 50 })).rejects.toBeInstanceOf(Conflict);
    await expect(client.getAuditProgress('s2')).rejects.toBeInstanceOf(NotFound);
  });

  it('fails loudly on an unconfigured call', () => {
    expect(() => fakeApiClient({}).startAudit({ url: 'x', limit: 50 })).toThrow('unexpected call');
  });
});
