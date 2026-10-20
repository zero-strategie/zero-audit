export const DEFAULT_SOURCE_URL = 'https://github.com/zero-strategie/zero-audit';

/**
 * Where users of this deployment can get its source code (AGPL-3.0, section 13).
 * A deployment running modified code must set ZERO_AUDIT_SOURCE_URL to its own repository.
 */
export const resolveSourceUrl = (env: Record<string, string | undefined>): string =>
  env['ZERO_AUDIT_SOURCE_URL']?.trim() || DEFAULT_SOURCE_URL;
