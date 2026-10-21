export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/** The links carry single-use secrets: implementations must never log them. */
export interface Mailer {
  /** False when no e-mail can leave: sign-up must then answer 503 whatever the address. */
  readonly enabled: boolean;
  sendVerification(to: string, link: string): Promise<void>;
  sendPasswordReset(to: string, link: string): Promise<void>;
}
