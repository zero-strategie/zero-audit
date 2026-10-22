import { describe, expect, it } from 'vitest';
import { checkReleaseVersion } from '../../scripts/release-version.js';

describe('checkReleaseVersion', () => {
  it('accepts a tag that matches the package version', () => {
    expect(checkReleaseVersion('v1.0.0', '1.0.0')).toEqual({ ok: true });
  });

  it('names both versions when they differ', () => {
    expect(checkReleaseVersion('v1.0.1', '1.0.0')).toEqual({
      ok: false,
      error: 'Tag version 1.0.1 does not match package.json version 1.0.0.',
    });
  });

  it.each(['1.0.0', 'vfoo', 'v1.0'])('rejects the malformed tag %s', (tag) => {
    expect(checkReleaseVersion(tag, '1.0.0')).toEqual({
      ok: false,
      error: `Invalid tag format "${tag}": expected v<major>.<minor>.<patch>.`,
    });
  });
});
