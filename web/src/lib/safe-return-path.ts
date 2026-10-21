const HOME = '/';
// Browsers strip tabs and line breaks from URLs, so "/\t/host" would become "//host".
const LAST_CONTROL_CODE = 0x1f;
const DELETE_CODE = 0x7f;

const isControlCode = (code: number): boolean => code <= LAST_CONTROL_CODE || code === DELETE_CODE;

const hasControlOrSpace = (value: string): boolean => {
  for (let index = 0; index < value.length; index++) {
    if (isControlCode(value.charCodeAt(index))) return true;
  }
  return /\s/.test(value);
};

/** Only same-site paths are accepted, so a login link cannot send the visitor to another site. */
export const safeReturnPath = (value: string | null): string => {
  if (value === null || !value.startsWith('/')) return HOME;
  if (hasControlOrSpace(value)) return HOME;
  if (value.startsWith('//') || value.startsWith('/\\')) return HOME;
  return value;
};
