import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readRepoFile = (path: string): string =>
  readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const stageBody = (dockerfile: string, stage: string): string => {
  const start = dockerfile.search(new RegExp(`^FROM .* AS ${stage}$`, 'm'));
  if (start === -1) return '';
  const rest = dockerfile.slice(start + 1);
  const next = rest.search(/^FROM /m);
  return next === -1 ? rest : rest.slice(0, next);
};

describe('Dockerfile', () => {
  const dockerfile = readRepoFile('Dockerfile');

  it('defines the api and web targets on node:22-bookworm-slim', () => {
    expect(dockerfile).toMatch(/^FROM node:22-bookworm-slim AS base$/m);
    expect(dockerfile).toMatch(/^FROM base AS api$/m);
    expect(dockerfile).toMatch(/^FROM base AS web$/m);
  });

  it('installs the compilation toolchain in the build stages only', () => {
    expect(stageBody(dockerfile, 'base')).not.toMatch(/build-essential|python3/);
    expect(stageBody(dockerfile, 'api')).not.toMatch(/build-essential|python3/);
    expect(stageBody(dockerfile, 'web')).not.toMatch(/build-essential|python3/);
    expect(stageBody(dockerfile, 'deps')).toMatch(/build-essential/);
  });

  it('runs both final targets as a non-root user', () => {
    expect(stageBody(dockerfile, 'api')).toMatch(/^USER node$/m);
    expect(stageBody(dockerfile, 'web')).toMatch(/^USER node$/m);
  });

  it('starts the api with serve on 0.0.0.0 and keeps the CLI as entry point', () => {
    const api = stageBody(dockerfile, 'api');
    expect(api).toMatch(/^ENV .*HOST=0\.0\.0\.0/m);
    expect(api).toMatch(/^ENTRYPOINT \["node", "dist\/cli\/main\.js"\]$/m);
    expect(api).toMatch(/^CMD \["serve"\]$/m);
  });

  it('gives the non-root user a writable default SQLite directory', () => {
    const api = stageBody(dockerfile, 'api');
    const chown = api.search(/chown node:node \/app\/\.zero-audit/);
    expect(chown).toBeGreaterThan(-1);
    expect(chown).toBeLessThan(api.search(/^USER node$/m));
  });

  it('starts the web server on 0.0.0.0', () => {
    const web = stageBody(dockerfile, 'web');
    expect(web).toMatch(/^ENV .*HOST=0\.0\.0\.0/m);
    expect(web).toMatch(/^CMD \["node", "dist\/server\/entry\.mjs"\]$/m);
  });

  it('labels both images with the GitHub repository', () => {
    const label = 'org.opencontainers.image.source="https://github.com/zero-strategie/zero-audit"';
    expect(stageBody(dockerfile, 'api')).toContain(label);
    expect(stageBody(dockerfile, 'web')).toContain(label);
  });
});

describe('.dockerignore', () => {
  it('keeps dependencies, local data, secrets, git and build outputs out of the context', () => {
    const entries = readRepoFile('.dockerignore').split('\n');
    for (const entry of ['**/node_modules', '.zero-audit', '.env', '.git', '**/dist']) {
      expect(entries).toContain(entry);
    }
  });
});
