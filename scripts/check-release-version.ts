import { readFileSync } from 'node:fs';
import { checkReleaseVersion } from './release-version.js';

const tag = process.env['GITHUB_REF_NAME'] ?? '';
const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

const result = checkReleaseVersion(tag, version);
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}
console.log(`Tag ${tag} matches package.json version ${version}.`);
