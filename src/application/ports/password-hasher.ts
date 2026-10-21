export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /** Never throws: a malformed stored hash simply does not match. */
  verify(password: string, storedHash: string): Promise<boolean>;
  /** Spends the cost of a real verification for an unknown account, then answers false. */
  verifyDummy(password: string): Promise<boolean>;
}
