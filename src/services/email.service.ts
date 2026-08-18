import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config/env.ts';
import { EMAIL_CONFIG } from '../constants/config.ts';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (EMAIL_CONFIG.PROVIDER !== 'smtp') return null;

  if (!env.SMTP_USER || !env.SMTP_PASS) {
    console.warn('[email] SMTP_USER / SMTP_PASS missing — emails will be logged only');
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: EMAIL_CONFIG.SMTP_HOST,
      port: EMAIL_CONFIG.SMTP_PORT,
      secure: EMAIL_CONFIG.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }

  return transporter;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}): Promise<boolean> {
  if (EMAIL_CONFIG.PROVIDER === 'mock') {
    console.log(`[email:mock] to=${input.to} subject=${input.subject}`);
    return true;
  }

  const tx = getTransporter();
  if (!tx) {
    console.log(`[email:fallback] to=${input.to} subject=${input.subject}`);
    return false;
  }

  await tx.sendMail({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });

  return true;
}
