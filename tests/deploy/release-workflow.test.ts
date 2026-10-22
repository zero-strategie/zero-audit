import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../.github/workflows/release.yml', import.meta.url),
  'utf8',
);
const [triggers = '', jobs = ''] = workflow.split(/^jobs:$/m);
const publishJob = jobs.split(/^ {2}publish:$/m)[1] ?? '';

describe('release workflow', () => {
  it('triggers on version tags only', () => {
    expect(triggers).toMatch(/^on:\n {2}push:\n {4}tags:\n {6}- 'v\*'\n/m);
  });

  it.each(['branches', 'pull_request', 'workflow_dispatch', 'schedule', 'workflow_call'])(
    'has no %s trigger that could publish outside a tag',
    (forbidden) => {
      expect(triggers).not.toContain(forbidden);
    },
  );

  it('reuses ci.yml in a verify job', () => {
    expect(jobs).toMatch(/^ {2}verify:\n {4}uses: \.\/\.github\/workflows\/ci\.yml$/m);
  });

  it('runs the publish job after verify', () => {
    expect(publishJob).toMatch(/^ {4}needs: verify$/m);
  });

  it('checks the tag against the package version before publishing', () => {
    const checkIndex = publishJob.indexOf('scripts/check-release-version.ts');
    expect(checkIndex).toBeGreaterThan(-1);
    expect(checkIndex).toBeLessThan(publishJob.indexOf('npm publish'));
  });

  it('publishes with provenance and public access', () => {
    expect(publishJob).toContain('run: npm publish --provenance --access public');
  });

  it('authenticates with the NPM_TOKEN secret on the npm registry', () => {
    expect(publishJob).toContain('NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}');
    expect(publishJob).toContain('registry-url: https://registry.npmjs.org');
  });

  it('grants only contents read and id-token write', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n\njobs:/m);
    expect(publishJob).toMatch(/^ {4}permissions:\n {6}contents: read\n {6}id-token: write\n/m);
    expect(workflow.match(/^\s+[\w-]+: (read|write)$/gm)).toHaveLength(3);
  });
});
