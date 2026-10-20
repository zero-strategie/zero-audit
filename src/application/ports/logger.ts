/** Operational log; messages must not carry personal data. */
export interface Logger {
  info(message: string): void;
  error(message: string): void;
}
