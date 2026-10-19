import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../', import.meta.url);
const MAIN = new URL('src/cli/main.ts', ROOT).pathname;

interface PackageJson {
  scripts: Record<string, string>;
  bin: Record<string, string>;
}

const readPackage = (): PackageJson =>
  JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8')) as PackageJson;

describe('package entry points', () => {
  it('declares the audit and zero-audit scripts and the zero-audit bin', () => {
    const { scripts, bin } = readPackage();
    expect(scripts['audit']).toBe('tsx src/cli/main.ts');
    expect(scripts['zero-audit']).toBe('tsx src/cli/main.ts');
    expect(bin['zero-audit']).toBe('dist/cli/main.js');
  });

  it('runs the real entry point in a subprocess with --help and exits 0', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', MAIN, '--help'], {
      cwd: ROOT.pathname,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--limit');
  });
});
