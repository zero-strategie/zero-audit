import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

describe('CI workflow', () => {
  it('uses Postgres 16 for the test service', () => {
    expect(workflow).toMatch(/image: postgres:16$/m);
    expect(workflow).not.toMatch(/postgres:17/);
  });

  it.each(['api', 'web'])('builds the %s image without pushing it', (target) => {
    const step = workflow
      .split(/^ {6}- /m)
      .find((s) => s.includes('docker/build-push-action') && s.includes(`target: ${target}`));
    expect(step).toBeDefined();
    expect(step).toMatch(/push: false/);
    expect(step).toMatch(/cache-from: type=gha/);
  });

  it('smoke-tests the loaded api image: --help and the SQL migrations in dist', () => {
    expect(workflow).toMatch(/docker run --rm zero-audit-api:ci --help/);
    expect(workflow).toMatch(/find dist -name '\*\.sql'/);
  });
});
