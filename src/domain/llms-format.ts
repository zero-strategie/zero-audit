import { MAX_FACT_EXAMPLES } from './thresholds.js';

export type LlmsProblemCode = 'missing-h1' | 'multiple-h1' | 'invalid-list-entry' | 'html-content';

export type LlmsProblem = {
  readonly code: LlmsProblemCode;
  /** 1-based line number the problem refers to; null when it concerns the whole file. */
  readonly line: number | null;
};

export type LlmsFacts = {
  /** Capped at `MAX_FACT_EXAMPLES`; `problemCount` tells the real total. */
  readonly problems: readonly LlmsProblem[];
  readonly problemCount: number;
};

const BYTE_ORDER_MARK = '﻿';
const HTML_START = /^\s*<(?:!doctype\s+html|html|head|body)\b/i;
const H1_LINE = /^#\s+\S/;
const SECTION_LINE = /^##\s/;
const LIST_ITEM = /^[-*]\s/;
const LINK_ENTRY = /^[-*]\s+\[[^\]]+\]\([^)\s]+\)/;

const problem = (code: LlmsProblemCode, line: number | null): LlmsProblem => ({ code, line });

export const validateLlmsTxt = (body: string): LlmsFacts => {
  const content = body.startsWith(BYTE_ORDER_MARK) ? body.slice(1) : body;
  return toFacts(
    HTML_START.test(content) ? [problem('html-content', null)] : findProblems(content),
  );
};

const toFacts = (problems: readonly LlmsProblem[]): LlmsFacts => ({
  problems: problems.slice(0, MAX_FACT_EXAMPLES),
  problemCount: problems.length,
});

const findProblems = (content: string): LlmsProblem[] => {
  const lines = content
    .split(/\r\n|\r|\n/)
    .map((raw, index) => ({ number: index + 1, text: raw.trim() }))
    .filter((line) => line.text !== '');

  const problems: LlmsProblem[] = [];
  const first = lines[0];
  if (first === undefined) return [problem('missing-h1', null)];
  if (!H1_LINE.test(first.text)) problems.push(problem('missing-h1', first.number));

  let h1Count = 0;
  let insideSection = false;
  for (const line of lines) {
    if (H1_LINE.test(line.text)) {
      h1Count += 1;
      if (h1Count > 1) problems.push(problem('multiple-h1', line.number));
    }
    if (SECTION_LINE.test(line.text)) insideSection = true;
    else if (H1_LINE.test(line.text)) insideSection = false;
    else if (insideSection && LIST_ITEM.test(line.text) && !LINK_ENTRY.test(line.text)) {
      problems.push(problem('invalid-list-entry', line.number));
    }
  }
  return problems;
};
