export type ReleaseVersionCheck =
  { readonly ok: true } | { readonly ok: false; readonly error: string };

const RELEASE_TAG_FORMAT = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

export const checkReleaseVersion = (tag: string, packageVersion: string): ReleaseVersionCheck => {
  const match = RELEASE_TAG_FORMAT.exec(tag);
  if (match === null) {
    return { ok: false, error: `Invalid tag format "${tag}": expected v<major>.<minor>.<patch>.` };
  }
  const tagVersion = match[1];
  if (tagVersion !== packageVersion) {
    return {
      ok: false,
      error: `Tag version ${tagVersion ?? ''} does not match package.json version ${packageVersion}.`,
    };
  }
  return { ok: true };
};
