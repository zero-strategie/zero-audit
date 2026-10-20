import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readRepoFile = (path: string): string =>
  readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const serviceBody = (compose: string, service: string): string => {
  const start = compose.search(new RegExp(`^ {2}${service}:$`, 'm'));
  if (start === -1) return '';
  const rest = compose.slice(start + 1);
  const next = rest.search(/^(?: {2}\S|\S)/m);
  return next === -1 ? rest : rest.slice(0, next);
};

describe('docker-compose.yml', () => {
  const compose = readRepoFile('docker-compose.yml');

  it('runs Postgres 16, the production version', () => {
    expect(serviceBody(compose, 'postgres')).toMatch(/image: postgres:16$/m);
  });

  it('runs migrate once, after Postgres is healthy', () => {
    const migrate = serviceBody(compose, 'migrate');
    expect(migrate).toMatch(/restart: ['"]?no['"]?$/m);
    expect(migrate).toMatch(/postgres:\s+condition: service_healthy/);
    expect(migrate).toMatch(/command: \['migrate'\]/);
  });

  it.each(['api', 'web'])('starts %s once migrate has completed successfully', (service) => {
    expect(serviceBody(compose, service)).toMatch(
      /migrate:\s+condition: service_completed_successfully/,
    );
  });

  it('builds the api and web images from their Dockerfile targets', () => {
    expect(serviceBody(compose, 'api')).toMatch(/target: api$/m);
    expect(serviceBody(compose, 'web')).toMatch(/target: web$/m);
  });

  it('publishes every port on 127.0.0.1 only', () => {
    const published = [...compose.matchAll(/^\s+- ['"]?([\d.:]+:\d+)['"]?$/gm)].map((m) => m[1]);
    expect(published).toHaveLength(3);
    for (const port of published) expect(port).toMatch(/^127\.0\.0\.1:/);
  });

  it('points the web server at the api service', () => {
    expect(serviceBody(compose, 'web')).toContain('ZERO_AUDIT_API_URL: http://api:3000');
  });
});
