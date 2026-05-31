import nodemailer, { type Transporter } from 'nodemailer';
import { getConfig } from '../config.js';
import { getLogger } from './logger.js';

let _transporter: Transporter | null = null;

export function getEmailTransporter(): Transporter | null {
  if (_transporter) return _transporter;
  const config = getConfig();
  if (!config.SMTP_HOST || !config.SMTP_PORT) return null;

  _transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: config.SMTP_USER && config.SMTP_PASS ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
  return _transporter;
}

export function isEmailConfigured(): boolean {
  const config = getConfig();
  return !!(config.SMTP_HOST && config.SMTP_PORT && config.SMTP_FROM);
}

export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const logger = getLogger();
  const transporter = getEmailTransporter();
  const config = getConfig();
  if (!transporter || !config.SMTP_FROM) {
    logger.warn('Email not configured, skipping send');
    return false;
  }

  try {
    await transporter.sendMail({ from: config.SMTP_FROM, to, subject, html, text });
    logger.info({ to, subject }, 'Email sent');
    return true;
  } catch (err) {
    logger.error({ to, subject, error: err }, 'Failed to send email');
    return false;
  }
}
