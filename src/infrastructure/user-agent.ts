import { readFileSync } from 'node:fs';

const PACKAGE_JSON_URL = new URL('../../package.json', import.meta.url);
const BOT_NAME = 'ZeroAuditBot';
const CONTACT_URL = 'https://zero-strategie.dev';

export const ROBOTS_TOKEN = BOT_NAME;

export const buildUserAgent = (): string => {
  const { version } = JSON.parse(readFileSync(PACKAGE_JSON_URL, 'utf8')) as { version: string };
  return `${BOT_NAME}/${version} (+${CONTACT_URL})`;
};
