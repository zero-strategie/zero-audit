import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

const jobNames = (): string[] => {
  const jobsSection = workflow.split(/^jobs:$/m)[1] ?? '';
  return [...jobsSection.matchAll(/^ {2}([\w-]+):$/gm)].map((match) => match[1] ?? '');
};

describe('CI workflow', () => {
  it('has two jobs, verify and package', () => {
    expect(jobNames()).toEqual(['verify', 'package']);
  });

  it('runs the package job after verify, building, checking and smoke-testing the pack', () => {
    const packageJob = workflow.split(/^ {2}package:$/m)[1] ?? '';
    expect(packageJob).toMatch(/^ {4}needs: verify$/m);
    expect(packageJob).toContain('run: pnpm build');
    expect(packageJob).toContain('run: pnpm pack:check');
    expect(packageJob).toContain('run: pnpm pack:smoke');
  });

  it('triggers on push, pull_request and workflow_call', () => {
    const triggers = workflow.split(/^jobs:$/m)[0] ?? '';
    expect(triggers).toMatch(/^ {2}push:$/m);
    expect(triggers).toMatch(/^ {2}pull_request:$/m);
    expect(triggers).toMatch(/^ {2}workflow_call:$/m);
  });

  it('limits the permissions to read-only contents', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read$/m);
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
