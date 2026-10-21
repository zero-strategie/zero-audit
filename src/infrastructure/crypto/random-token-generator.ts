import { randomBytes } from 'node:crypto';
import type { TokenGenerator } from '../../application/ports/token-generator.js';

const TOKEN_BYTES = 32;

export class RandomTokenGenerator implements TokenGenerator {
  generate(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
  }
}
