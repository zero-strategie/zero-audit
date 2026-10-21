import { InvalidPassword } from './errors.js';

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

/** Length only: composition rules push users to predictable passwords. */
export const assertValidPassword = (password: string): void => {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new InvalidPassword();
  }
};
