import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as api from '../src/index.js';

const EXPECTED_EXPORTS = [
  'ANONYMOUS_READER',
  'AssertPublicTarget',
  'AuditInterrupted',
  'AwaitAudit',
  'CheckHealth',
  'CheckWorkerHealth',
  'CompareSnapshots',
  'DnsHostResolver',
  'GetAuditProgress',
  'GetSnapshotReport',
  'HostNotResolved',
  'InvalidAuditUrl',
  'ListIssues',
  'ListOccurrences',
  'ListPages',
  'ListProjectSnapshots',
  'ListProjects',
  'PrivateAddressRejected',
  'ProcessAuditQueue',
  'QueueAudit',
  'RecoverStaleAudits',
  'RunAudit',
  'SEVERITY_WEIGHTS',
  'Snapshot',
  'UNKNOWN_PROJECT_ROOT_URL',
  'allChecks',
  'buildScoreCard',
  'canRead',
  'computeHealth',
  'computeThemeScores',
  'countBySeverity',
  'createAuditWorker',
  'createRunAudit',
  'createStorage',
  'isPublicAddress',
  'migrateStorage',
  'passRate',
  'roundScore',
  'runCli',
  'scoreVariation',
  'topIssues',
];

const FORBIDDEN_NAMES = /user|session|email|mail|quota|password|auth|fastify|server|purge|erase/i;

describe('public API surface', () => {
  it('exports exactly the expected names', () => {
    expect(Object.keys(api).sort()).toEqual([...EXPECTED_EXPORTS].sort());
  });

  it('exports no name related to accounts, quotas or the hosted product', () => {
    expect(Object.keys(api).filter((name) => FORBIDDEN_NAMES.test(name))).toEqual([]);
  });

  it('uses only named exports and does not load the CLI entry point', () => {
    const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/export \*/);
    expect(source).not.toMatch(/export default/);
    expect(source).not.toMatch(/cli\/main\.js/);
  });

  it('has no side effect when imported', async () => {
    const stdout = vi.spyOn(process.stdout, 'write');
    const stderr = vi.spyOn(process.stderr, 'write');
    const exitCodeBefore = process.exitCode;
    vi.resetModules();
    await import('../src/index.js');
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(exitCodeBefore);
    vi.restoreAllMocks();
  });
});
