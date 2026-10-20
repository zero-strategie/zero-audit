import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const docs = ['README.md', 'docs/user-guide.md', 'docs/developer-guide.md']
  .map((file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'))
  .join('\n');

describe('Docker documentation', () => {
  it.each([
    'docker build --target api',
    'docker build --target web',
    'docker compose up',
    'http://127.0.0.1:3000/health',
    'http://127.0.0.1:4321/health',
    'Docker is not required',
  ])('documents %s', (text) => {
    expect(docs).toContain(text);
  });
});
