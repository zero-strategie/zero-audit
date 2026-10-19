import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string): string =>
  readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');

describe('local Postgres setup files', () => {
  it('defines a postgres:17 service with a volume, a loopback port and no committed password', () => {
    const compose = read('docker-compose.yml');
    expect(compose).toContain('image: postgres:17');
    expect(compose).toMatch(/^volumes:/m);
    expect(compose).toContain("'127.0.0.1:5432:5432'");
    expect(compose).toContain('POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?');
  });

  it('documents the storage settings in .env.example', () => {
    const example = read('.env.example');
    expect(example).toMatch(/^ZERO_AUDIT_STORE=sqlite$/m);
    expect(example).toMatch(/^DATABASE_URL=postgresql:\/\//m);
  });

  it('documents the storage settings in the README', () => {
    const readme = read('README.md');
    for (const term of ['--store', 'ZERO_AUDIT_STORE', 'DATABASE_URL', 'docker compose up']) {
      expect(readme).toContain(term);
    }
  });
});
