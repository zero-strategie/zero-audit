import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string): string =>
  readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');

describe('local Postgres setup files', () => {
  it('defines a postgres:16 service with a volume, a loopback port and no committed password', () => {
    const compose = read('docker-compose.yml');
    expect(compose).toContain('image: postgres:16');
    expect(compose).toMatch(/^volumes:/m);
    expect(compose).toContain("'127.0.0.1:5432:5432'");
    expect(compose).toContain('POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?');
  });

  it('declares only the postgres service, without any image build', () => {
    const compose = read('docker-compose.yml');
    const services = compose.split(/^services:$/m)[1]?.split(/^volumes:$/m)[0] ?? '';
    expect([...services.matchAll(/^ {2}([\w-]+):$/gm)].map((match) => match[1])).toEqual([
      'postgres',
    ]);
    expect(compose).not.toMatch(/^\s*build:/m);
  });

  it('documents the storage settings in .env.example', () => {
    const example = read('.env.example');
    expect(example).toMatch(/^ZERO_AUDIT_STORE=sqlite$/m);
    expect(example).toMatch(/^DATABASE_URL=postgresql:\/\//m);
  });

  it('documents the storage settings in the guides', () => {
    const readme = read('README.md') + read('docs/user-guide.md') + read('docs/developer-guide.md');
    for (const term of ['--store', 'ZERO_AUDIT_STORE', 'DATABASE_URL', 'docker compose up']) {
      expect(readme).toContain(term);
    }
  });

  it('documents no API, e-mail, administrator or quota variable in .env.example', () => {
    const example = read('.env.example');
    for (const variable of [
      'HOST',
      'PORT',
      'ZERO_AUDIT_MAIL_FROM',
      'ZERO_AUDIT_PUBLIC_URL',
      'ZERO_AUDIT_ADMIN_EMAILS',
      'ZERO_AUDIT_LAUNCHES_PER_DAY',
      'ZERO_AUDIT_QUEUE_MAX',
      'ZERO_AUDIT_WORKER=',
    ]) {
      expect(example).not.toContain(variable);
    }
  });
});
