import { describe, expect, it } from 'vitest';
import { PoliteHttpClient } from '../../src/application/polite-http-client.js';
import type { HttpClient } from '../../src/application/ports/http-client.js';

const events: string[] = [];
const inner: HttpClient = {
  get: (url) => {
    events.push(`get ${url}`);
    return Promise.resolve({ url, kind: 'other', message: '' });
  },
};
const sleeper = {
  sleep: (ms: number) => {
    events.push(`sleep ${String(ms)}`);
    return Promise.resolve();
  },
};

describe('PoliteHttpClient', () => {
  it('waits between consecutive requests but never before the first', async () => {
    events.length = 0;
    const client = new PoliteHttpClient(inner, sleeper, 1000);

    await client.get('a');
    await client.get('b');
    client.delayMs = 3000;
    await client.get('c');

    expect(events).toEqual(['get a', 'sleep 1000', 'get b', 'sleep 3000', 'get c']);
  });
});
