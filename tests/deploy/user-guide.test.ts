import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { USAGE } from '../../src/cli/usage.js';

const guide = readFileSync(new URL('../../docs/user-guide.md', import.meta.url), 'utf8');
const envExample = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');

const variablesOf = (text: string): Set<string> =>
  new Set(
    [
      ...text.matchAll(
        /\b(ZERO_AUDIT_[A-Z_]+|DATABASE_URL|POSTGRES_PASSWORD|TEST_DATABASE_URL)\b/g,
      ),
    ].map((match) => match[1] ?? ''),
  );

const commandsOfUsage = (): string[] => {
  const section = /^Commandes\n((?: {2}.*\n?)+)/m.exec(USAGE)?.[1] ?? '';
  return [...section.matchAll(/^ {2}([a-z][a-z-]*)\s/gm)].map((match) => match[1] ?? '');
};

const sectionOf = (command: string): string => {
  const start = guide.indexOf(`### ${command}\n`);
  const next = guide.indexOf('\n#', start + 1);
  return start === -1 ? '' : guide.slice(start, next === -1 ? undefined : next);
};

describe('user guide of the CLI', () => {
  it.each(['docker', 'dashboard', 'brevo'])('does not mention %s', (text) => {
    expect(guide.toLowerCase()).not.toContain(text);
  });

  it('does not mention the serve command', () => {
    expect(guide).not.toMatch(/\bserve\b/i);
  });

  it('extracts every command of the usage', () => {
    expect(commandsOfUsage()).toEqual(['audit', 'compare', 'migrate', 'worker', 'worker-health']);
  });

  it.each(commandsOfUsage())('documents %s with an example', (command) => {
    const section = sectionOf(command);
    expect(section).toContain('```sh');
    const example =
      command === 'audit' ? /zero-audit (audit )?https?:\/\// : new RegExp(`zero-audit ${command}`);
    expect(section).toMatch(example);
  });

  it('documents exactly the variables of .env.example', () => {
    expect([...variablesOf(guide)].sort()).toEqual([...variablesOf(envExample)].sort());
  });

  it('states that the CLI messages are in French', () => {
    expect(guide).toMatch(/messages.*French/is);
  });

  it.each(['0', '1', '2', '130', '143'])('describes exit code %s', (code) => {
    expect(guide).toMatch(new RegExp(`^\\| ${code} \\|`, 'm'));
  });
});
