import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

describe('README Docker section', () => {
  it.each([
    'docker build --target api',
    'docker build --target web',
    'docker compose up',
    'http://127.0.0.1:3000/health',
    'http://127.0.0.1:4321/health',
    'Docker is not required',
  ])('documents %s', (text) => {
    expect(readme).toContain(text);
  });
});
