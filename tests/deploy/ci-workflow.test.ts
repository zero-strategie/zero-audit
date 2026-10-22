import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

const jobNames = (): string[] => {
  const jobsSection = workflow.split(/^jobs:$/m)[1] ?? '';
  return [...jobsSection.matchAll(/^ {2}([\w-]+):$/gm)].map((match) => match[1] ?? '');
};

describe('CI workflow', () => {
  it('has a single job, verify', () => {
    expect(jobNames()).toEqual(['verify']);
  });

  it.each(['docker/', 'ghcr.io', 'build-and-push', 'deploy', 'packages: write'])(
    'does not mention %s: the public repository builds and publishes no image',
    (forbidden) => {
      expect(workflow).not.toContain(forbidden);
    },
  );

  it('uses Postgres 16 for the test service', () => {
    expect(workflow).toMatch(/image: postgres:16$/m);
    expect(workflow).not.toMatch(/postgres:17/);
  });

  it('defines TEST_DATABASE_URL for the test steps', () => {
    expect(workflow).toMatch(/^ {6}TEST_DATABASE_URL: postgresql:\/\//m);
  });

  it('fails when a Postgres test is skipped', () => {
    expect(workflow).toMatch(
      /pnpm vitest run tests\/infrastructure\/postgres-snapshot-repository\.test\.ts .*\| tee postgres\.log && ! grep -q skipped postgres\.log/,
    );
  });
});
