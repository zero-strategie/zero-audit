import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../', import.meta.url);
const MAIN = new URL('src/cli/main.ts', ROOT).pathname;

interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
  type: string;
  main: string;
  types: string;
  exports: Record<string, { types: string; import: string }>;
  files: string[];
  engines: { node: string };
  publishConfig: { access: string };
  license: string;
  repository: { url: string };
  scripts: Record<string, string>;
  bin: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
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

  it('declares publishable npm metadata', () => {
    const pkg = readPackage();
    expect(pkg.name).toBe('@zero-strategie/zero-audit-core');
    expect(pkg.version).toBe('1.0.1');
    expect(pkg.private).toBeUndefined();
    expect(pkg.type).toBe('module');
    expect(pkg.main).toBe('dist/index.js');
    expect(pkg.types).toBe('dist/index.d.ts');
    expect(pkg.exports['.']).toEqual({ types: './dist/index.d.ts', import: './dist/index.js' });
    expect(pkg.files).toEqual(
      expect.arrayContaining(['dist', 'LICENSE', 'COPYRIGHT', 'README.md']),
    );
    expect(pkg.engines.node).toBe('>=22');
    expect(pkg.publishConfig.access).toBe('public');
    expect(pkg.license).toBe('AGPL-3.0-only');
    expect(pkg.repository.url).toContain('github.com/zero-strategie/zero-audit');
    expect(pkg.scripts['prepublishOnly']).toBeDefined();
  });

  it('ships the type packages as runtime dependencies', () => {
    const { dependencies, devDependencies } = readPackage();
    for (const name of ['@types/pg', '@types/better-sqlite3']) {
      expect(dependencies[name]).toBeDefined();
      expect(devDependencies[name]).toBeUndefined();
    }
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
