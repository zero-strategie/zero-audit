import { describe, expect, it } from 'vitest';
import { FastXmlSitemapReader } from '../../src/infrastructure/fast-xml-sitemap-reader.js';

const NS = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
const reader = new FastXmlSitemapReader();

describe('FastXmlSitemapReader', () => {
  it('reads the loc entries of a urlset', () => {
    const xml = `<?xml version="1.0"?><urlset ${NS}><url><loc>https://a.test/1</loc></url><url><loc> https://a.test/2 </loc><lastmod>2026-01-01</lastmod></url></urlset>`;

    expect(reader.parse(xml).sitemap).toMatchObject({
      kind: 'urlset',
      locs: ['https://a.test/1', 'https://a.test/2'],
    });
  });

  it('reads a urlset holding a single url', () => {
    const xml = `<urlset ${NS}><url><loc>https://a.test/1</loc></url></urlset>`;

    expect(reader.parse(xml).sitemap).toMatchObject({ kind: 'urlset', locs: ['https://a.test/1'] });
  });

  it('reads the sitemaps referenced by a sitemap index', () => {
    const xml = `<sitemapindex ${NS}><sitemap><loc>https://a.test/s1.xml</loc></sitemap><sitemap><loc>https://a.test/s2.xml</loc></sitemap></sitemapindex>`;

    expect(reader.parse(xml).sitemap).toMatchObject({
      kind: 'index',
      locs: ['https://a.test/s1.xml', 'https://a.test/s2.xml'],
    });
  });

  it('returns an empty list for an empty urlset', () => {
    expect(reader.parse(`<urlset ${NS}></urlset>`).sitemap).toMatchObject({
      kind: 'urlset',
      locs: [],
    });
  });

  it.each(['', 'not xml at all', '<urlset><url></urlset>'])(
    'flags malformed XML %j and reads no sitemap',
    (xml) => {
      expect(reader.parse(xml)).toEqual({ sitemap: null, malformedXml: true });
    },
  );

  it('reads no sitemap from well-formed XML that is not a sitemap', () => {
    expect(reader.parse('<html><body>hi</body></html>')).toEqual({
      sitemap: null,
      malformedXml: false,
    });
  });

  describe('format issues', () => {
    const issuesOf = (xml: string) => reader.parse(xml).sitemap?.issues;
    const url = (inner: string) =>
      `<urlset ${NS}><url><loc>https://a.test/1</loc>${inner}</url></urlset>`;

    it('reports no issue for a conforming sitemap and counts its entries', () => {
      const xml = url(
        '<lastmod>2026-01-01T10:00:00+01:00</lastmod><changefreq>daily</changefreq><priority>0.5</priority>',
      );

      expect(reader.parse(xml).sitemap).toMatchObject({ entryCount: 1, issues: [] });
    });

    it('reports a root without the sitemaps.org namespace and still reads the urls', () => {
      const xml = '<urlset><url><loc>https://a.test/1</loc></url></urlset>';

      expect(reader.parse(xml).sitemap).toMatchObject({
        locs: ['https://a.test/1'],
        issues: [{ type: 'wrong-namespace', loc: null, value: null }],
      });
    });

    it('accepts a prefixed root bound to the sitemaps.org namespace', () => {
      const xml =
        '<sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"><sm:url><sm:loc>https://a.test/1</sm:loc></sm:url></sm:urlset>';

      expect(issuesOf(xml)).toEqual([]);
    });

    it('reports a url without loc', () => {
      const xml = `<urlset ${NS}><url><lastmod>2026-01-01</lastmod></url><url/></urlset>`;

      expect(issuesOf(xml)).toEqual([
        { type: 'missing-loc', loc: null, value: null },
        { type: 'missing-loc', loc: null, value: null },
      ]);
    });

    it('reports a relative loc and keeps it', () => {
      const xml = `<urlset ${NS}><url><loc>/page</loc></url></urlset>`;

      expect(reader.parse(xml).sitemap).toMatchObject({
        locs: ['/page'],
        issues: [{ type: 'relative-loc', loc: '/page', value: null }],
      });
    });

    it('reports a loc longer than 2048 characters', () => {
      const loc = `https://a.test/${'a'.repeat(2040)}`;

      expect(issuesOf(`<urlset ${NS}><url><loc>${loc}</loc></url></urlset>`)).toEqual([
        { type: 'loc-too-long', loc, value: null },
      ]);
    });

    it.each([
      ['lastmod', '2026-13-01', 'invalid-lastmod'],
      ['lastmod', 'yesterday', 'invalid-lastmod'],
      ['lastmod', '2026-01-01T10:00', 'invalid-lastmod'],
      ['changefreq', 'sometimes', 'invalid-changefreq'],
      ['changefreq', 'Daily', 'invalid-changefreq'],
      ['priority', '1.5', 'invalid-priority'],
      ['priority', 'high', 'invalid-priority'],
      ['priority', '', 'invalid-priority'],
    ])('reports %s=%j', (tag, value, type) => {
      expect(issuesOf(url(`<${tag}>${value}</${tag}>`))).toEqual([
        { type, loc: 'https://a.test/1', value },
      ]);
    });

    it.each(['2026', '2026-02', '2026-02-03', '2026-02-03T04:05Z', '2026-02-03T04:05:06.5-05:00'])(
      'accepts the W3C lastmod %s',
      (value) => {
        expect(issuesOf(url(`<lastmod>${value}</lastmod>`))).toEqual([]);
      },
    );

    it.each(['0', '1', '0.8', '1.0'])('accepts priority %s', (value) => {
      expect(issuesOf(url(`<priority>${value}</priority>`))).toEqual([]);
    });

    it('checks the loc and lastmod of the entries of an index', () => {
      const xml = `<sitemapindex ${NS}><sitemap><loc>s.xml</loc><lastmod>never</lastmod></sitemap></sitemapindex>`;

      expect(reader.parse(xml).sitemap).toMatchObject({
        kind: 'index',
        entryCount: 1,
        issues: [
          { type: 'relative-loc', loc: 's.xml', value: null },
          { type: 'invalid-lastmod', loc: 's.xml', value: 'never' },
        ],
      });
    });
  });
});
