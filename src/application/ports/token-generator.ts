/** Source of the secrets handed to users (session identifiers, e-mail tokens); injectable for tests. */
export interface TokenGenerator {
  generate(): string;
}
