import type { EmailContent } from '../ports/mailer.js';

export const buildVerificationLink = (publicUrl: string, token: string): string =>
  `${publicUrl}/verifier-email?token=${encodeURIComponent(token)}`;

export const buildPasswordResetLink = (publicUrl: string, token: string): string =>
  `${publicUrl}/reinitialiser?token=${encodeURIComponent(token)}`;

const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

interface Wording {
  subject: string;
  intro: string;
  action: string;
  ignore: string;
}

const compose = (wording: Wording, link: string): EmailContent => ({
  subject: wording.subject,
  text: `Bonjour,\n\n${wording.intro}\n\n${wording.action} : ${link}\n\n${wording.ignore}\n`,
  html:
    `<p>Bonjour,</p><p>${wording.intro}</p>` +
    `<p><a href="${escapeHtml(link)}">${wording.action}</a></p><p>${wording.ignore}</p>`,
});

export const verificationEmail = (link: string): EmailContent =>
  compose(
    {
      subject: 'Confirmez votre adresse',
      intro: 'Pour activer votre compte Zero Audit, confirmez votre adresse e-mail.',
      action: 'Activer mon compte',
      ignore: "Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message.",
    },
    link,
  );

export const passwordResetEmail = (link: string): EmailContent =>
  compose(
    {
      subject: 'Réinitialiser votre mot de passe',
      intro: 'Une réinitialisation du mot de passe de votre compte Zero Audit a été demandée.',
      action: 'Choisir un nouveau mot de passe',
      ignore:
        "Si vous n'avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.",
    },
    link,
  );
