import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSteps, type SmokeStep } from './smoke-steps.js';

const PACKAGE_NAME = '@zero-strategie/zero-audit-core';

const CONSUMER_JS = `import { createStorage } from '${PACKAGE_NAME}';

const storage = await createStorage({
  store: 'sqlite',
  databaseUrl: null,
  dbPath: process.argv[2],
});
if (storage.connection.kind !== 'sqlite') {
  throw new Error('expected a sqlite connection, got ' + storage.connection.kind);
}
await storage.close();
`;

const CONSUMER_TS = `import type { Storage } from '${PACKAGE_NAME}';

type PostgresConnection = Extract<Storage['connection'], { kind: 'postgres' }>;

export const ping = (connection: PostgresConnection) => connection.pool.query('SELECT 1');
`;

const TSCONFIG = {
  compilerOptions: {
    strict: true,
    module: 'nodenext',
    moduleResolution: 'nodenext',
    target: 'es2023',
    noEmit: true,
    skipLibCheck: true,
  },
  files: ['consumer.ts'],
};

const run = (command: string, args: readonly string[], cwd: string): string =>
  execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const runConsumer = (cwd: string, dbPath: string): void => {
  const result = spawnSync('node', ['consumer.mjs', dbPath], { cwd, encoding: 'utf8' });
  if (result.status !== 0)
    throw new Error(`consumer exited with ${String(result.status)}\n${result.stderr}`);
  if (result.stdout !== '' || result.stderr !== '') {
    throw new Error(
      `importing the package wrote to stdout/stderr:\n${result.stdout}${result.stderr}`,
    );
  }
};

const repoRoot = process.cwd();
const workDir = mkdtempSync(join(tmpdir(), 'zero-audit-smoke-'));
const packDir = join(workDir, 'pack');
const consumerDir = join(workDir, 'consumer');
const dbPath = join(workDir, 'smoke.sqlite');
mkdirSync(packDir);
mkdirSync(consumerDir);

const steps: readonly SmokeStep[] = [
  { name: 'build', run: () => void run('pnpm', ['build'], repoRoot) },
  {
    name: 'pack',
    run: () =>
      void run('npm', ['pack', '--pack-destination', packDir, '--ignore-scripts'], repoRoot),
  },
  {
    name: 'install',
    run: () => {
      const [tarball] = readdirSync(packDir);
      if (tarball === undefined) throw new Error('no tarball produced');
      writeFileSync(
        join(consumerDir, 'package.json'),
        '{"name":"consumer","private":true,"type":"module"}',
      );
      run(
        'npm',
        ['install', '--no-audit', '--no-fund', join(packDir, tarball), 'typescript', '@types/node'],
        consumerDir,
      );
    },
  },
  {
    name: 'cli --help',
    run: () => {
      if (!run('npx', ['--no-install', 'zero-audit', '--help'], consumerDir).includes('Usage')) {
        throw new Error('help text not displayed');
      }
    },
  },
  {
    name: 'cli migrate',
    run: () =>
      void run('npx', ['--no-install', 'zero-audit', 'migrate', '--db', dbPath], consumerDir),
  },
  {
    name: 'import and open storage',
    run: () => {
      writeFileSync(join(consumerDir, 'consumer.mjs'), CONSUMER_JS);
      runConsumer(consumerDir, dbPath);
    },
  },
  {
    name: 'type declarations',
    run: () => {
      writeFileSync(join(consumerDir, 'consumer.ts'), CONSUMER_TS);
      writeFileSync(join(consumerDir, 'tsconfig.json'), JSON.stringify(TSCONFIG));
      run(
        'npx',
        [
          '--no-install',
          'tsc',
          '--noEmit',
          '--strict',
          '--module',
          'nodenext',
          '--moduleResolution',
          'nodenext',
          '-p',
          '.',
        ],
        consumerDir,
      );
    },
  },
];

const failure = await runSteps(steps, () => {
  rmSync(workDir, { recursive: true, force: true });
});
if (failure !== null) {
  console.error(failure);
  process.exit(1);
}
console.log('Packed package is usable.');
