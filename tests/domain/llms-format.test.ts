import { describe, expect, it } from 'vitest';
import { validateLlmsTxt } from '../../src/domain/llms-format.js';
import { MAX_FACT_EXAMPLES } from '../../src/domain/thresholds.js';

const CONFORMING = [
  '# Exemple',
  '',
  '> Résumé du site.',
  '',
  '## Docs',
  '',
  '- [Guide](https://exemple.com/guide): le guide',
  '- [API](https://exemple.com/api)',
].join('\n');

describe('validateLlmsTxt', () => {
  it('reports no problem for a conforming file', () => {
    expect(validateLlmsTxt(CONFORMING)).toEqual({ problems: [], problemCount: 0 });
  });

  it('flags a first non-empty line that is not a "# title" heading', () => {
    const facts = validateLlmsTxt('\n\nBienvenue\n# Titre');

    expect(facts.problems).toContainEqual({ code: 'missing-h1', line: 3 });
  });

  it('flags an empty file as missing its H1', () => {
    expect(validateLlmsTxt('').problems).toContainEqual({ code: 'missing-h1', line: null });
  });

  it('flags a second H1 with its line number', () => {
    const facts = validateLlmsTxt('# Un\n\n# Deux');

    expect(facts.problems).toEqual([{ code: 'multiple-h1', line: 3 }]);
  });

  it('flags list entries under a "##" section that are not "- [title](url)"', () => {
    const body = '# Titre\n\n## Docs\n- [ok](https://exemple.com/a)\n- pas un lien\n- [sans url]';

    expect(validateLlmsTxt(body).problems).toEqual([
      { code: 'invalid-list-entry', line: 5 },
      { code: 'invalid-list-entry', line: 6 },
    ]);
  });

  it('ignores list entries outside a "##" section and non-list lines inside one', () => {
    const body = '# Titre\n- libre\n\n## Docs\nTexte libre';

    expect(validateLlmsTxt(body).problems).toEqual([]);
  });

  it('flags an HTML body as html-content only', () => {
    const facts = validateLlmsTxt('<!DOCTYPE html><html><body>404</body></html>');

    expect(facts.problems).toEqual([{ code: 'html-content', line: null }]);
  });

  it('caps the listed problems but keeps the real total', () => {
    const entries = Array.from({ length: MAX_FACT_EXAMPLES + 5 }, () => '- nope').join('\n');

    const facts = validateLlmsTxt(`# T\n## S\n${entries}`);

    expect(facts.problems).toHaveLength(MAX_FACT_EXAMPLES);
    expect(facts.problemCount).toBe(MAX_FACT_EXAMPLES + 5);
  });
});
