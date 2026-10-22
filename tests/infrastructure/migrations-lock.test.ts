import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type MigrationLock = Readonly<Record<string, string>>;

const diffMigrationLock = (expected: MigrationLock, actual: MigrationLock): string[] => {
  const names = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  return names
    .filter((name) => expected[name] !== actual[name])
    .map((name) => `migrations are frozen: ${name}`);
};

const POSTGRES_LOCK: MigrationLock = {
  '001_init.sql': 'acb25bd4bd814b0e28cb134aa0e3c7df5dbaadf4e726087ef4eb5f3d1e1c6ee8',
  '002_slash_probes.sql': '95cafdbce743a9b1c364f3d64992143003633448bc8d7d51a0197369dc05b520',
  '003_page_text_ratio.sql': 'b9cfa092686b3eb954817a0c114d34a3a1b930d5c975be1cbc81ccc27f1d0463',
  '004_accounts.sql': 'ab1e6228bd5b17d782f5986dbf417b592bb4a734324b8745a3d60f7471d4371c',
  '005_api_launches.sql': 'd02a2f7a43c816d7aa93968aaf2151fd275577a2c095cc0ea3223d6181a68f75',
  '006_audit_queue.sql': 'fe1e06cd84788d34ab87c9fdbea4ccc10de5515530d2275497da5ceedd1d9f8a',
  '007_page_html_facts.sql': '7d774f939fb078732e4e6774f80e3197d146b52e2ea1888eba6e218f41ca871f',
};

const SQLITE_LOCK: MigrationLock = {
  '001_init.sql': '57032028e02b5c3b7a5b7beeeea2044a1ec13b13ecede8abc426266c0a5cb91b',
  '002_projects.sql': '29cdb1a70b04b61e5493aba35f7a3bb171e263923f32ae70b278830870d75d36',
  '003_blocked_pages.sql': 'bc1be85d33ababb204e7d26fa9ec0b3108c160bd8a2fde7369c90cd7c7147184',
  '004_site_files.sql': '93ebe4b3f04da0560596330c896f857d876ad2d7dccdfcf7dfdb3c45e3551e3c',
  '005_page_canonical.sql': '0bd7c9f7f02576355a68b33bdaafc886a1162de5b6c571e8dfdff21713e78701',
  '006_host_probes.sql': '6cdc14cf034645be6d21fb77911fb7445740f706c8823ab4497c28aa3a88859a',
  '007_slash_probes.sql': '75191685981bd6dd7eb0b5601706b6e9db2f21bb2ec8487f99fb1f6cc816ba0f',
  '008_page_text_ratio.sql': '44de23ce487d441fdee23dc9ce19550bac9d0e480a05bdaf9ebfe16b47f388b3',
  '009_accounts.sql': '0a205928d375b5cd9b3f551d52d5b0227a52c5e06b9c93e001e5d3bf368852c4',
  '010_api_launches.sql': '215380afbf0041308dd60f0609eff574e1e818ccd084111a8f413831d60d885c',
  '011_audit_queue.sql': '7c86f70877c72759d1341d8ad5895252567bb4f4ebf35961cdfbeffb3bab611e',
  '012_page_html_facts.sql': '326bf2e32bcbc6a127939f5eebe6ec0a12275239aa4e27166067893c0e394345',
};

const readMigrationFingerprints = (directory: string): MigrationLock =>
  Object.fromEntries(
    readdirSync(directory)
      .sort()
      .map((name) => [
        name,
        createHash('sha256')
          .update(readFileSync(join(directory, name)))
          .digest('hex'),
      ]),
  );

describe('diffMigrationLock', () => {
  const expected = { '001_a.sql': 'aaa', '002_b.sql': 'bbb' };

  it('returns no difference when both tables are identical', () => {
    expect(diffMigrationLock(expected, { ...expected })).toEqual([]);
  });

  it('names a file whose fingerprint changed', () => {
    expect(diffMigrationLock(expected, { ...expected, '002_b.sql': 'bbc' })).toEqual([
      'migrations are frozen: 002_b.sql',
    ]);
  });

  it('names an added file', () => {
    expect(diffMigrationLock(expected, { ...expected, '007_drop_users.sql': 'ccc' })).toEqual([
      'migrations are frozen: 007_drop_users.sql',
    ]);
  });

  it('names a missing file', () => {
    expect(diffMigrationLock(expected, { '001_a.sql': 'aaa' })).toEqual([
      'migrations are frozen: 002_b.sql',
    ]);
  });
});

describe('existing migrations', () => {
  it('keeps exactly the 7 Postgres migrations unchanged', () => {
    const actual = readMigrationFingerprints('src/infrastructure/postgres/migrations');

    expect(Object.keys(actual)).toHaveLength(7);
    expect(diffMigrationLock(POSTGRES_LOCK, actual)).toEqual([]);
  });

  it('keeps exactly the 12 SQLite migrations unchanged', () => {
    const actual = readMigrationFingerprints('src/infrastructure/sqlite/migrations');

    expect(Object.keys(actual)).toHaveLength(12);
    expect(diffMigrationLock(SQLITE_LOCK, actual)).toEqual([]);
  });
});
