import { MAX_FACT_EXAMPLES, MAX_INVALID_LINE_TEXT_LENGTH } from './thresholds.js';

export type InvalidRobotsLine = {
  /** 1-based line number. */
  readonly number: number;
  /** Line without its comment, truncated to `MAX_INVALID_LINE_TEXT_LENGTH`. */
  readonly text: string;
};

export type RobotsGrammarFacts = {
  /** Invalid lines, capped at `MAX_FACT_EXAMPLES`. */
  readonly invalidLines: readonly InvalidRobotsLine[];
  readonly invalidCount: number;
  readonly sitemapDeclarations: number;
};

/** RFC 9309 section 2.2 keys plus the common extensions accepted without warning. */
const KNOWN_KEYS: ReadonlySet<string> = new Set([
  'user-agent',
  'allow',
  'disallow',
  'sitemap',
  'crawl-delay',
  'host',
  'clean-param',
]);
/** Keys that only make sense inside a group opened by a user-agent line. */
const GROUP_RULE_KEYS: ReadonlySet<string> = new Set(['allow', 'disallow', 'crawl-delay']);

const BYTE_ORDER_MARK = '﻿';
const HTML_START = /^\s*<(?:!doctype\s+html|html|head|body)\b/i;
const COMMENT_MARK = '#';
const SEPARATOR = ':';

const significantLines = (body: string): { number: number; text: string }[] =>
  body
    .split(/\r\n|\r|\n/)
    .map((raw, index) => ({ number: index + 1, text: raw.split(COMMENT_MARK)[0]?.trim() ?? '' }))
    .filter((line) => line.text !== '');

const isInvalidLine = (text: string, insideGroup: boolean): boolean => {
  const separatorAt = text.indexOf(SEPARATOR);
  if (separatorAt <= 0) return true;
  const key = text.slice(0, separatorAt).trim().toLowerCase();
  if (!KNOWN_KEYS.has(key)) return true;
  return GROUP_RULE_KEYS.has(key) && !insideGroup;
};

const keyOf = (text: string): string => text.slice(0, text.indexOf(SEPARATOR)).trim().toLowerCase();

export const validateRobotsTxt = (body: string): RobotsGrammarFacts => {
  const content = body.startsWith(BYTE_ORDER_MARK) ? body.slice(1) : body;
  const lines = significantLines(content);
  const looksLikeHtml = HTML_START.test(content);

  const invalid: InvalidRobotsLine[] = [];
  let insideGroup = false;
  let sitemapDeclarations = 0;
  for (const line of lines) {
    if (looksLikeHtml || isInvalidLine(line.text, insideGroup)) {
      invalid.push({ number: line.number, text: line.text.slice(0, MAX_INVALID_LINE_TEXT_LENGTH) });
      continue;
    }
    const key = keyOf(line.text);
    if (key === 'user-agent') insideGroup = true;
    if (key === 'sitemap') sitemapDeclarations += 1;
  }

  return {
    invalidLines: invalid.slice(0, MAX_FACT_EXAMPLES),
    invalidCount: invalid.length,
    sitemapDeclarations,
  };
};
