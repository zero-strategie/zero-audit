import { describe, expect, it } from 'vitest';
import {
  buildPasswordResetLink,
  buildVerificationLink,
  passwordResetEmail,
  verificationEmail,
} from '../../src/application/emails/index.js';

const PUBLIC_URL = 'https://audit.exemple.test';

describe('e-mail links', () => {
  it('points the verification link to /verifier-email', () => {
    expect(buildVerificationLink(PUBLIC_URL, 'abc_-123')).toBe(
      'https://audit.exemple.test/verifier-email?token=abc_-123',
    );
  });

  it('points the reset link to /reinitialiser and encodes the token', () => {
    expect(buildPasswordResetLink(PUBLIC_URL, 'a b&c')).toBe(
      'https://audit.exemple.test/reinitialiser?token=a%20b%26c',
    );
  });
});

describe('e-mail templates', () => {
  const link = `${PUBLIC_URL}/verifier-email?token=t&x=1`;

  it('writes the verification e-mail in French with the link in both bodies', () => {
    const email = verificationEmail(link);

    expect(email.subject).toBe('Confirmez votre adresse');
    expect(email.text).toContain(link);
    expect(email.html).toContain(
      'href="https://audit.exemple.test/verifier-email?token=t&amp;x=1"',
    );
  });

  it('writes the reset e-mail in French with the link in both bodies', () => {
    const email = passwordResetEmail(link);

    expect(email.subject).toBe('Réinitialiser votre mot de passe');
    expect(email.text).toContain(link);
    expect(email.html).toContain('&amp;x=1');
  });
});
