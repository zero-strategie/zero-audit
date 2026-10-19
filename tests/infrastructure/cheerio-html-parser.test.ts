import { describe, expect, it } from 'vitest';
import { CheerioHtmlParser } from '../../src/infrastructure/cheerio-html-parser.js';

const NBSP = String.fromCharCode(0xa0);
const PAGE_URL = 'https://h/x/y';

describe('CheerioHtmlParser links', () => {
  const parser = new CheerioHtmlParser();
  const linksOf = (html: string, pageUrl = PAGE_URL) => parser.parse(html, pageUrl).links;

  it('extracts resolved target, rel and anchor text of each a[href]', () => {
    const html = `<body><a href="/a" rel="nofollow"> Voir  </a><a href="https://e.test/b"></a></body>`;

    expect(linksOf(html)).toEqual([
      { targetUrl: 'https://h/a', kind: 'anchor', rel: 'nofollow', anchor: 'Voir' },
      { targetUrl: 'https://e.test/b', kind: 'anchor', rel: null, anchor: null },
    ]);
  });

  it('extracts img, script and stylesheet link as resources', () => {
    const html = `<head><link rel="stylesheet" href="/s.css"><link rel="icon" href="/f.ico"><script src="/j.js"></script></head><body><img src="/i.png"></body>`;

    expect(linksOf(html).map((l) => [l.targetUrl, l.kind])).toEqual([
      ['https://h/s.css', 'resource'],
      ['https://h/j.js', 'resource'],
      ['https://h/i.png', 'resource'],
    ]);
  });

  it('ignores mailto, tel, javascript and fragment-only links', () => {
    const html = `<a href="mailto:a@b.test">m</a><a href="tel:123">t</a><a href="javascript:void(0)">j</a><a href="#top">f</a>`;

    expect(linksOf(html)).toEqual([]);
  });

  it('resolves links against base href when present', () => {
    const html = `<head><base href="https://h/z/"></head><a href="a">a</a>`;

    expect(linksOf(html).map((l) => l.targetUrl)).toEqual(['https://h/z/a']);
  });

  it('keeps repeated links as distinct occurrences', () => {
    expect(linksOf(`<a href="/a">1</a><a href="/a">2</a>`)).toHaveLength(2);
  });
});

describe('CheerioHtmlParser metadata', () => {
  const parser = new CheerioHtmlParser();
  const parse = (html: string) => parser.parse(html, PAGE_URL);

  it('normalizes whitespace in the title', () => {
    expect(parse('<title>  Bonjour \n  le   monde </title>').title).toBe('Bonjour le monde');
  });

  it('gives null without title tag and empty string for an empty one', () => {
    expect(parse('<body>x</body>').title).toBeNull();
    expect(parse('<title></title>').title).toBe('');
  });

  it('keeps the first meta description trimmed, null when absent', () => {
    const html = `<meta name="description" content="  Premier "><meta name="description" content="Second">`;

    expect(parse(html).metaDescription).toBe('Premier');
    expect(parse('<body></body>').metaDescription).toBeNull();
  });

  it('lists h1 texts in document order', () => {
    expect(parse('<h1>Un</h1><h1> Deux  2 </h1>').h1).toEqual(['Un', 'Deux 2']);
  });

  it('counts visible body words, excluding script, style, noscript and template', () => {
    const fifty = Array.from({ length: 50 }, () => 'mot').join(' ');
    const html = `<body><p>un deux trois</p> quatre${NBSP}cinq<script>${fifty}</script><style>${fifty}</style><noscript>${fifty}</noscript><template>${fifty}</template></body>`;

    expect(parse(html).wordCount).toBe(5);
  });

  it('separates words of adjacent block elements in minified html', () => {
    const html = '<body><p>un</p><p>deux</p><ul><li>trois</li><li>quatre</li></ul></body>';

    expect(parse(html).wordCount).toBe(4);
  });

  it('ignores a title that is not in the head', () => {
    expect(parse('<body><svg><title>Icon</title></svg></body>').title).toBeNull();
  });

  it('hashes identical content identically and does not expose raw html', () => {
    const html = '<body>same</body>';

    const first = parse(html);
    expect(first.contentHash).toBe(parse(html).contentHash);
    expect(first.contentHash).not.toBe(parse('<body>other</body>').contentHash);
    expect(JSON.stringify(first)).not.toContain('<body>');
  });

  it('does not throw on malformed html', () => {
    const parsed = parse('<html><head><title>T</title><body><div><h1>H<p>un <a href="/a">x');

    expect(parsed.links).toHaveLength(1);
    expect(parsed.title).toBe('T');
    expect(parsed.h1).toHaveLength(1);
    expect(parsed.wordCount).toBeGreaterThan(0);
  });
});
