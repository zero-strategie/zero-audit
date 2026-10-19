import { describe, expect, it } from 'vitest';
import { CheerioHtmlParser } from '../../src/infrastructure/cheerio-html-parser.js';

describe('CheerioHtmlParser.extractLinks', () => {
  const parser = new CheerioHtmlParser();

  it('extracts href, rel and anchor text of each a[href]', () => {
    const html = `<body><a href="/a" rel="nofollow"> Page  A </a><a href="/b"></a></body>`;

    expect(parser.extractLinks(html)).toEqual([
      { href: '/a', rel: 'nofollow', anchor: 'Page A' },
      { href: '/b', rel: null, anchor: null },
    ]);
  });

  it('ignores anchors without href and other elements', () => {
    const html = `<a name="x">no</a><link rel="stylesheet" href="/s.css"><img src="/i.png">`;

    expect(parser.extractLinks(html)).toEqual([]);
  });
});
