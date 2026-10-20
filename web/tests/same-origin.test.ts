import { describe, expect, it } from 'vitest';
import { isSameOrigin } from '../src/lib/same-origin';

const post = (headers: Record<string, string>) =>
  new Request('http://127.0.0.1:4321/audits/new', { method: 'POST', headers });

describe('isSameOrigin', () => {
  it('accepts an Origin that matches the Host header', () => {
    expect(isSameOrigin(post({ origin: 'http://audit.test', host: 'audit.test' }))).toBe(true);
  });

  it('compares the port as well as the host', () => {
    expect(isSameOrigin(post({ origin: 'http://audit.test:4321', host: 'audit.test:4321' }))).toBe(
      true,
    );
    expect(isSameOrigin(post({ origin: 'http://audit.test:4321', host: 'audit.test:80' }))).toBe(
      false,
    );
  });

  it('rejects a different origin', () => {
    expect(isSameOrigin(post({ origin: 'https://evil.test', host: 'audit.test' }))).toBe(false);
  });

  it('rejects a request without Origin', () => {
    expect(isSameOrigin(post({ host: 'audit.test' }))).toBe(false);
  });

  it('rejects an Origin that is not a URL', () => {
    expect(isSameOrigin(post({ origin: 'null', host: 'audit.test' }))).toBe(false);
  });

  it('prefers X-Forwarded-Host over Host', () => {
    const headers = {
      origin: 'https://audit.example',
      host: '127.0.0.1:4321',
      'x-forwarded-host': 'audit.example',
    };
    expect(isSameOrigin(post(headers))).toBe(true);
    expect(isSameOrigin(post({ ...headers, origin: 'http://127.0.0.1:4321' }))).toBe(false);
  });

  it('only considers the first value of X-Forwarded-Host', () => {
    const headers = { origin: 'https://audit.example', host: 'internal' };
    expect(
      isSameOrigin(post({ ...headers, 'x-forwarded-host': 'audit.example, proxy.internal' })),
    ).toBe(true);
    expect(
      isSameOrigin(post({ ...headers, 'x-forwarded-host': 'proxy.internal, audit.example' })),
    ).toBe(false);
  });
});
