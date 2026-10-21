import type { Project } from './project.js';

/**
 * Who is reading. An administrator has no extra read right: they see their own projects and the
 * showcase only, like any other account.
 */
export type Reader =
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'account'; readonly userId: string; readonly isAdmin: boolean };

export const ANONYMOUS_READER: Reader = { kind: 'anonymous' };

/** The showcase (no owner) is public; any other project is visible to its owner alone. */
export const canRead = (reader: Reader, project: Project): boolean =>
  project.ownerId === null || (reader.kind === 'account' && project.ownerId === reader.userId);

/** The id used to include the reader's own projects in a listing, null when anonymous. */
export const readerUserId = (reader: Reader): string | null =>
  reader.kind === 'account' ? reader.userId : null;
