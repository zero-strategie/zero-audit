import { describe, expect, it } from 'vitest';
import type { Project } from '../../src/domain/project.js';
import { ANONYMOUS_READER, canRead, type Reader } from '../../src/domain/reader.js';

const projectOwnedBy = (ownerId: string | null): Project => ({
  id: 'p',
  rootUrl: 'https://e.com/',
  ownerId,
  createdAt: new Date(0),
});

const account = (userId: string, isAdmin = false): Reader => ({ kind: 'account', userId, isAdmin });

describe('canRead', () => {
  it.each([
    ['an anonymous reader', ANONYMOUS_READER],
    ['an account', account('u')],
    ['an administrator', account('a', true)],
  ])('lets %s read a showcase project', (_label, reader) => {
    expect(canRead(reader, projectOwnedBy(null))).toBe(true);
  });

  it('lets an account read its own project', () => {
    expect(canRead(account('u'), projectOwnedBy('u'))).toBe(true);
  });

  it.each([
    ['an anonymous reader', ANONYMOUS_READER],
    ['another account', account('v')],
    ['an administrator', account('a', true)],
  ])('hides a private project from %s', (_label, reader) => {
    expect(canRead(reader, projectOwnedBy('u'))).toBe(false);
  });
});

describe('canRead for an account reader', () => {
  it.each([true, false])('gives the same answer whatever isAdmin is (%s)', (isAdmin) => {
    const reader = account('B', isAdmin);
    expect(canRead(reader, projectOwnedBy('A'))).toBe(false);
    expect(canRead(reader, projectOwnedBy('B'))).toBe(true);
    expect(canRead(reader, projectOwnedBy(null))).toBe(true);
  });
});
