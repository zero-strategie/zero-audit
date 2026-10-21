import { expect, it } from 'vitest';
import { RESET_TTL_MS, VERIFY_TTL_MS } from '../../src/domain/email-token.js';
import { SESSION_TTL_MS } from '../../src/domain/session.js';

const HOUR_MS = 60 * 60 * 1000;

it('keeps sessions for 30 days, verification links for 24 hours and reset links for 1 hour', () => {
  expect([SESSION_TTL_MS, VERIFY_TTL_MS, RESET_TTL_MS]).toEqual([
    30 * 24 * HOUR_MS,
    24 * HOUR_MS,
    HOUR_MS,
  ]);
});
