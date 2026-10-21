import { createHash } from 'node:crypto';

/** Session identifiers and e-mail tokens are high-entropy, so a fast hash is enough to store them. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
