import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const globalCss = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
const ruleBody = (selector: string) =>
  new RegExp(`${selector.replace(/[.:]/g, (c) => `\\${c}`)}\\s*{([^}]*)}`).exec(globalCss)?.[1] ??
  '';

it('gives every severity its own shape, so severity is never carried by color alone', () => {
  expect(ruleBody('.severity-badge::before')).toMatch(/content:/);
  expect(ruleBody('.severity-warning::before')).toMatch(/clip-path:\s*polygon/);
  expect(ruleBody('.severity-notice::before')).toMatch(/border-radius:\s*50%/);
  expect(ruleBody('.severity-error::before')).not.toMatch(/clip-path|border-radius/);
});
