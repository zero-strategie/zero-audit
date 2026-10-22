import { execFileSync } from 'node:child_process';
import { checkPackFiles } from './pack-rules.js';

interface PackReport {
  readonly files: readonly { readonly path: string }[];
}

const listPackedFiles = (): string[] => {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    encoding: 'utf8',
  });
  const [report] = JSON.parse(output) as Partial<PackReport>[];
  if (report?.files === undefined) {
    throw new Error('unexpected output from npm pack --dry-run --json');
  }
  return report.files.map((file) => file.path);
};

const errors = checkPackFiles(listPackedFiles());
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Package content is conform.');
