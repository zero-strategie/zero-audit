const HOME = '/';

/** Only same-site paths are accepted, so a login link cannot send the visitor to another site. */
export const safeReturnPath = (value: string | null): string => {
  if (value === null || !value.startsWith('/')) return HOME;
  if (value.startsWith('//') || value.startsWith('/\\')) return HOME;
  return value;
};
