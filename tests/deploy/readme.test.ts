import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

describe('README of the open-source engine', () => {
  it.each([
    'npm install @zero-strategie/zero-audit-core',
    'npx zero-audit',
    'npx @zero-strategie/zero-audit-core https://',
    'zero-audit https://',
    'import { createStorage',
    'https://audit.zero-strategie.dev',
  ])('contains %s', (text) => {
    expect(readme).toContain(text);
  });

  it.each(['docker', 'Dockerfile', 'ghcr.io', 'dashboard', 'zero-audit serve', 'fastify'])(
    'does not mention %s',
    (text) => {
      expect(readme.toLowerCase()).not.toContain(text.toLowerCase());
    },
  );

  it('no longer claims the repository contains no Semrush data', () => {
    expect(readme).not.toContain('contains no Semrush code, data or text');
  });

  it.each(['docs/reference', 'copy of that catalogue', 'public issue catalogue'])(
    'does not claim to hold a Semrush catalogue (%s)',
    (text) => {
      expect(readme).not.toContain(text);
    },
  );

  it('says the check ids follow the numbering of Semrush Site Audit, without affiliation', () => {
    expect(readme).toContain("follow the numbering used by Semrush's Site Audit");
    expect(readme).toContain('not affiliated with or endorsed by Semrush');
  });

  it('states that Zero Stratégie has no link with Ahrefs or Screaming Frog', () => {
    expect(readme).toContain('Zero Stratégie has no link with Ahrefs or Screaming Frog');
  });

  it('states that the CLI messages are in French', () => {
    expect(readme).toMatch(/messages.*French/is);
  });

  it.each(['AGPL-3.0-only', 'docs/user-guide.md', 'docs/developer-guide.md', 'docs/checks.md'])(
    'mentions %s',
    (text) => {
      expect(readme).toContain(text);
    },
  );
});
