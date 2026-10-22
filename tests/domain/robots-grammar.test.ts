import { describe, expect, it } from 'vitest';
import { validateRobotsTxt } from '../../src/domain/robots-grammar.js';
import { MAX_FACT_EXAMPLES } from '../../src/domain/thresholds.js';

describe('validateRobotsTxt', () => {
  it('accepts a well-formed file and counts its sitemap declarations', () => {
    const body = [
      '# comment',
      'User-agent: *',
      'Disallow: /private # trailing comment',
      'Allow: /',
      'Crawl-delay: 5',
      'Host: exemple.com',
      'Clean-param: ref /articles/',
      'Sitemap: https://exemple.com/a.xml',
      'Sitemap: https://exemple.com/b.xml',
    ].join('\n');

    expect(validateRobotsTxt(body)).toEqual({
      invalidLines: [],
      invalidCount: 0,
      sitemapDeclarations: 2,
    });
  });

  it('flags a non-empty, non-comment line without a key: value shape, with its number', () => {
    const body = 'User-agent: *\n\nthis is prose\nDisallow: /x';

    expect(validateRobotsTxt(body)).toMatchObject({ invalidLines: [3], invalidCount: 1 });
  });

  it('flags a key outside the supported list, ignoring case for known keys', () => {
    const body = 'USER-AGENT: *\nNoindex: /x\nDISALLOW: /y';

    expect(validateRobotsTxt(body)).toMatchObject({ invalidLines: [2], invalidCount: 1 });
  });

  it('flags a disallow placed before any user-agent', () => {
    const body = 'Disallow: /x\nUser-agent: *\nDisallow: /y';

    expect(validateRobotsTxt(body)).toMatchObject({ invalidLines: [1], invalidCount: 1 });
  });

  it('accepts a sitemap before any user-agent but flags a group rule placed there', () => {
    const body = 'Sitemap: https://exemple.com/a.xml\nAllow: /\nUser-agent: *';

    expect(validateRobotsTxt(body)).toMatchObject({
      invalidLines: [2],
      invalidCount: 1,
      sitemapDeclarations: 1,
    });
  });

  it('flags the whole file when the body looks like HTML', () => {
    const body = '﻿<!DOCTYPE html>\n<html><body>Not found</body></html>';

    expect(validateRobotsTxt(body)).toMatchObject({ invalidLines: [1, 2], invalidCount: 2 });
  });

  it('caps the listed lines but keeps the real count', () => {
    const body = Array.from({ length: MAX_FACT_EXAMPLES + 5 }, () => 'garbage').join('\n');
    const facts = validateRobotsTxt(body);

    expect(facts.invalidLines).toHaveLength(MAX_FACT_EXAMPLES);
    expect(facts.invalidCount).toBe(MAX_FACT_EXAMPLES + 5);
  });
});
