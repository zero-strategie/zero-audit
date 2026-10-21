import type { AstroCookieSetOptions } from 'astro';

export const SESSION_COOKIE = 'za_session';

const SESSION_DAYS = 30;
const SECONDS_PER_DAY = 86_400;

export const SESSION_COOKIE_OPTIONS: AstroCookieSetOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_DAYS * SECONDS_PER_DAY,
};
