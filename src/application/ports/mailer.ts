export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/** The links carry single-use secrets: implementations must never log them. */
export interface Mailer {
  sendVerification(to: string, link: string): Promise<void>;
  sendPasswordReset(to: string, link: string): Promise<void>;
}
