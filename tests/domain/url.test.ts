import { describe, expect, it } from 'vitest';
import { alternateHostUrl, isInternal, normalizeUrl, resolveUrl } from '../../src/domain/url.js';

describe('normalizeUrl', () => {
  it('lowercases scheme and host and drops default port and fragment', () => {
    expect(normalizeUrl('HTTP://Exemple.COM:80/a?b=1#frag')).toBe('http://exemple.com/a?b=1');
  });

  it('adds a root path but keeps trailing slashes significant', () => {
    expect(normalizeUrl('https://exemple.com')).toBe('https://exemple.com/');
    expect(normalizeUrl('https://exemple.com/a/')).not.toBe(normalizeUrl('https://exemple.com/a'));
  });
});

describe('resolveUrl', () => {
  it('resolves a relative href against the page url', () => {
    expect(resolveUrl('../b', 'https://exemple.com/x/y')).toBe('https://exemple.com/b');
  });

  it.each(['mailto:a@b.c', 'tel:+33100000000', 'javascript:void(0)', '#ancre'])(
    'returns null for %s',
    (href) => {
      expect(resolveUrl(href, 'https://exemple.com/')).toBeNull();
    },
  );
});

describe('isInternal', () => {
  it('compares the exact host, ignoring case and scheme', () => {
    expect(isInternal('http://EXEMPLE.com/a', 'exemple.com')).toBe(true);
    expect(isInternal('https://exemple.com/b', 'exemple.com')).toBe(true);
    expect(isInternal('https://www.exemple.com/c', 'exemple.com')).toBe(false);
  });
});

describe('alternateHostUrl', () => {
  it.each([
    ['https://x.test/', 'https://www.x.test/'],
    ['https://www.x.test/', 'https://x.test/'],
    ['http://x.test:8080/a/b?q=1', 'http://www.x.test:8080/'],
  ])('probes the home page of the other host for %s', (root, expected) => {
    expect(alternateHostUrl(root)).toBe(expected);
  });

  it.each(['http://localhost:3000/', 'http://127.0.0.1/', 'http://[::1]:8080/'])(
    'has no alternate host for %s',
    (root) => {
      expect(alternateHostUrl(root)).toBeNull();
    },
  );
});
