import { describe, expect, it } from 'vitest';
import { FastXmlSitemapReader } from '../../src/infrastructure/fast-xml-sitemap-reader.js';

const NS = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
const reader = new FastXmlSitemapReader();

describe('FastXmlSitemapReader', () => {
  it('reads the loc entries of a urlset', () => {
    const xml = `<?xml version="1.0"?><urlset ${NS}><url><loc>https://a.test/1</loc></url><url><loc> https://a.test/2 </loc><lastmod>2026-01-01</lastmod></url></urlset>`;

    expect(reader.parse(xml)).toEqual({
      kind: 'urlset',
      locs: ['https://a.test/1', 'https://a.test/2'],
    });
  });

  it('reads a urlset holding a single url', () => {
    const xml = `<urlset ${NS}><url><loc>https://a.test/1</loc></url></urlset>`;

    expect(reader.parse(xml)).toEqual({ kind: 'urlset', locs: ['https://a.test/1'] });
  });

  it('reads the sitemaps referenced by a sitemap index', () => {
    const xml = `<sitemapindex ${NS}><sitemap><loc>https://a.test/s1.xml</loc></sitemap><sitemap><loc>https://a.test/s2.xml</loc></sitemap></sitemapindex>`;

    expect(reader.parse(xml)).toEqual({
      kind: 'index',
      locs: ['https://a.test/s1.xml', 'https://a.test/s2.xml'],
    });
  });

  it('returns an empty list for an empty urlset', () => {
    expect(reader.parse(`<urlset ${NS}></urlset>`)).toEqual({ kind: 'urlset', locs: [] });
  });

  it.each(['', 'not xml at all', '<html><body>hi</body></html>', '<urlset><url></urlset>'])(
    'returns null for invalid content %j',
    (xml) => {
      expect(reader.parse(xml)).toBeNull();
    },
  );
});
