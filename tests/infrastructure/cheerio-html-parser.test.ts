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

  it('measures the text ratio as visible body bytes over received html bytes', () => {
    const text = 'a'.repeat(50);
    const prefix = `<body><p>${text}</p>`;
    const html = `${prefix}${'<!---->'.repeat(100)}`.padEnd(1000, ' ');

    expect(Buffer.byteLength(html)).toBe(1000);
    expect(parse(html).textRatio).toBe(0.05);
  });

  it('measures the text ratio in utf-8 bytes, not characters', () => {
    const html = '<body>éé</body>';

    expect(parse(html).textRatio).toBe(4 / Buffer.byteLength(html));
  });

  it('ignores script, style, noscript and template text in the text ratio', () => {
    const html = `<body>ab<script>${'x'.repeat(40)}</script><style>${'x'.repeat(40)}</style><noscript>${'x'.repeat(40)}</noscript><template>${'x'.repeat(40)}</template></body>`;

    expect(parse(html).textRatio).toBe(2 / Buffer.byteLength(html));
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

describe('CheerioHtmlParser canonical', () => {
  const parser = new CheerioHtmlParser();
  const canonicalOf = (html: string) => parser.parse(html, PAGE_URL).canonical;

  it('resolves the canonical href into an absolute URL', () => {
    expect(canonicalOf('<head><link rel="canonical" href="/a"></head>')).toBe('https://h/a');
  });

  it('is null without a canonical link', () => {
    expect(canonicalOf('<head><link rel="stylesheet" href="/s.css"></head>')).toBeNull();
  });
});

describe('CheerioHtmlParser header facts', () => {
  const parser = new CheerioHtmlParser();
  const parse = (html: string) => parser.parse(html, PAGE_URL);

  it('reads the viewport content, or null without the tag', () => {
    expect(parse('<head><meta name="viewport" content="width=device-width"></head>').viewport).toBe(
      'width=device-width',
    );
    expect(parse('<head></head>').viewport).toBeNull();
  });

  it('reads the declared charset from meta charset or http-equiv, else null', () => {
    expect(parse('<head><meta charset="utf-8"></head>').charset).toBe('utf-8');
    expect(
      parse('<head><meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1"></head>')
        .charset,
    ).toBe('ISO-8859-1');
    expect(parse('<head></head>').charset).toBeNull();
  });

  it('detects a leading doctype ignoring case, whitespace and comments', () => {
    expect(parse('<!DOCTYPE html><html></html>').hasDoctype).toBe(true);
    expect(parse('  \n<!-- c --> <!doctype HTML>\n<html></html>').hasDoctype).toBe(true);
    expect(parse('<html><!DOCTYPE html></html>').hasDoctype).toBe(false);
    expect(parse('<html></html>').hasDoctype).toBe(false);
  });

  it('reads the html lang, or null when absent or empty', () => {
    expect(parse('<html lang="fr-FR"></html>').lang).toBe('fr-FR');
    expect(parse('<html lang=""></html>').lang).toBeNull();
    expect(parse('<html></html>').lang).toBeNull();
  });

  it('counts canonical links and keeps the first as canonical', () => {
    const parsed = parse(
      '<head><link rel="canonical" href="/a"><link rel="canonical" href="/a"></head>',
    );

    expect(parsed.canonicalCount).toBe(2);
    expect(parsed.canonical).toBe('https://h/a');
    expect(parse('<head></head>').canonicalCount).toBe(0);
  });

  it('reads the meta refresh delay and absolute target, null target without url', () => {
    const refresh = (content: string, base = '') =>
      parse(`<head>${base}<meta http-equiv="Refresh" content="${content}"></head>`).metaRefresh;

    expect(refresh('5; url=/x')).toEqual({ delaySeconds: 5, target: 'https://h/x' });
    expect(refresh("0;URL='/y'")).toEqual({ delaySeconds: 0, target: 'https://h/y' });
    expect(refresh('5')).toEqual({ delaySeconds: 5, target: null });
    expect(refresh('3; url=z', '<base href="https://h/b/">')).toEqual({
      delaySeconds: 3,
      target: 'https://h/b/z',
    });
    expect(refresh('soon')).toBeNull();
    expect(parse('<head></head>').metaRefresh).toBeNull();
  });

  it('lists images without an alt attribute, keeping empty alt as valid', () => {
    const html = '<img src="/a.png"><img src="/b.png" alt=""><img src="/c.png" alt="c">';

    expect(parse(html).imagesWithoutAlt).toEqual({ total: 1, examples: ['/a.png'] });
  });

  it('caps image examples at 20 while counting all of them', () => {
    const html = Array.from({ length: 25 }, (_, i) => `<img src="/i${String(i)}.png">`).join('');
    const { imagesWithoutAlt } = parse(html);

    expect(imagesWithoutAlt.total).toBe(25);
    expect(imagesWithoutAlt.examples).toHaveLength(20);
  });

  it('detects frames, including those parse5 drops, but not iframes or commented frames', () => {
    expect(parse('<frameset><frame src="/a"></frameset>').hasFrames).toBe(true);
    expect(parse('<body><p>x</p><frameset cols="*"></frameset>').hasFrames).toBe(true);
    expect(parse('<body><div><frame src="/a"></div></body>').hasFrames).toBe(true);
    expect(parse('<body><iframe src="/a"></iframe></body>').hasFrames).toBe(false);
    expect(parse('<body><!-- <frame src="/a"> --></body>').hasFrames).toBe(false);
  });

  describe('json-ld', () => {
    const block = (json: string) => `<script type="application/ld+json">${json}</script>`;

    it('counts blocks, flags unparseable ones with a reason and collects types', () => {
      const html =
        block('{"@context":"https://schema.org","@type":"Article"}') + block('{not json');

      expect(parse(html).jsonLd).toEqual({
        count: 2,
        invalid: 1,
        types: ['Article'],
        invalidReasons: ['unparseable'],
      });
    });

    it('requires a root @context and a @type on each top-level node', () => {
      const reasons = (json: string) => parse(block(json)).jsonLd.invalidReasons;

      expect(reasons('{"@type":"Thing"}')).toEqual(['missing-context']);
      expect(reasons('{"@context":"c","name":"x"}')).toEqual(['missing-type']);
      expect(reasons('{"@context":"c","@graph":[{"@type":"A"},{"name":"b"}]}')).toEqual([
        'missing-type',
      ]);
      expect(reasons('{"@context":"c","@graph":[{"@type":"A"},{"@type":["B","C"]}]}')).toEqual([]);
      expect(reasons('{"@context":"c","@type":"A"}')).toEqual([]);
      expect(reasons('[{"@context":"c","@type":"A"},{"@context":"c"}]')).toEqual(['missing-type']);
      expect(reasons('42')).toEqual(['missing-context']);
    });

    it('lists distinct types of valid blocks only', () => {
      const html =
        block('{"@context":"c","@graph":[{"@type":"A"},{"@type":["B","A"]}]}') +
        block('{"@context":"c","@type":"D"}') +
        block('{"@context":"c","name":"no type"}');

      expect(parse(html).jsonLd.types).toEqual(['A', 'B', 'D']);
      expect(parse('<p>none</p>').jsonLd).toEqual({
        count: 0,
        invalid: 0,
        types: [],
        invalidReasons: [],
      });
    });
  });

  it('lists tracked semantic elements in a fixed order', () => {
    expect(parse('<body><nav></nav><main><div></div></main></body>').semanticElements).toEqual([
      'main',
      'nav',
    ]);
    expect(parse('<body><div></div></body>').semanticElements).toEqual([]);
  });

  it('measures the received html in utf-8 bytes', () => {
    expect(parse('<p>é</p>').htmlBytes).toBe(9);
  });

  it('lists hreflang alternates with absolute urls', () => {
    const parsed = parse(
      '<head><link rel="alternate" hreflang="en-GB" href="/en"><link rel="alternate" href="/x"></head>',
    );

    expect(parsed.hreflang).toEqual([{ lang: 'en-GB', url: 'https://h/en' }]);
  });

  it('lists malformed anchor hrefs raw, with a total', () => {
    const hrefs = ['http:/x', 'https//x', 'htp://x', 'foo:bar', 'http://[bad'];
    const html = hrefs.map((href) => `<a href="${href}">x</a>`).join('');

    expect(parse(html).malformedLinks).toEqual({ total: 5, examples: hrefs });
  });

  it('caps the malformed examples but keeps the total', () => {
    const html = Array.from({ length: 25 }, (_, i) => `<a href="htp://x${String(i)}">x</a>`).join(
      '',
    );

    const { malformedLinks } = parse(html);

    expect(malformedLinks.total).toBe(25);
    expect(malformedLinks.examples).toHaveLength(20);
  });

  it('ignores empty, fragment-only and void javascript hrefs and valid schemes', () => {
    const hrefs = [
      '#',
      '',
      '#top',
      'javascript:void(0)',
      '/a',
      'mailto:a@b.c',
      'tel:+33',
      'https://h/z',
      'data:text/plain,x',
    ];
    const html = hrefs.map((href) => `<a href="${href}">x</a>`).join('');

    expect(parse(html).malformedLinks).toEqual({ total: 0, examples: [] });
  });

  it('lists subresources loaded over http, but not anchors nor https ones', () => {
    const html = `<head><link rel="stylesheet" href="http://h/a.css"><script src="http://h/a.js"></script></head>
      <body><img src="http://h/i.png" srcset="http://h/i2.png 2x, https://h/i3.png 3x">
      <iframe src="http://h/f"></iframe><video poster="http://h/p.png"></video>
      <audio src="http://h/a.mp3"></audio><picture><source srcset="http://h/s.webp"></picture>
      <embed src="http://h/e"><object data="http://h/o"></object>
      <a href="http://h/page">x</a><img src="https://h/ok.png"></body>`;

    expect(parse(html).insecureResources).toEqual({
      total: 10,
      examples: [
        'http://h/a.css',
        'http://h/a.js',
        'http://h/i.png',
        'http://h/i2.png',
        'http://h/f',
        'http://h/p.png',
        'http://h/a.mp3',
        'http://h/s.webp',
        'http://h/e',
        'http://h/o',
      ],
    });
  });

  it('lists declared feeds as absolute urls', () => {
    const html = `<head><link rel="alternate" type="application/rss+xml" href="/rss.xml">
      <link rel="alternate" type="application/atom+xml" href="/atom.xml">
      <link rel="alternate" type="application/feed+json" href="/feed.json">
      <link rel="alternate" type="text/html" href="/other"></head>`;

    expect(parse(html).declaredFeeds).toEqual([
      'https://h/rss.xml',
      'https://h/atom.xml',
      'https://h/feed.json',
    ]);
  });
});
