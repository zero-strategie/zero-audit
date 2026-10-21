export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;

export const LOGIN_FAILURES_PER_ACCOUNT = 5;
export const LOGIN_FAILURES_PER_IP = 20;
export const LOGIN_WINDOW_MS = 15 * MINUTE_MS;
export const REGISTRATIONS_PER_IP_PER_HOUR = 5;
/** E-mailed links (verification or reset, together) an address may receive per hour. */
export const EMAIL_LINKS_PER_HOUR = 3;
