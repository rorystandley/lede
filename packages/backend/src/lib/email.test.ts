import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createTransportMock,
  configMock,
  loggerMock,
} = vi.hoisted(() => {
  const createTransportMock = vi.fn();
  const configMock = vi.fn();
  const loggerMock = {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  };

  return {
    createTransportMock,
    configMock,
    loggerMock,
  };
});

vi.mock('nodemailer', () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

vi.mock('../config.js', () => ({
  getConfig: configMock,
}));

vi.mock('./logger.js', () => ({
  getLogger: vi.fn(() => loggerMock),
}));

describe('email helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns null when smtp is not configured and skips sending', async () => {
    configMock.mockReturnValue({
      SMTP_HOST: '',
      SMTP_PORT: 0,
      SMTP_FROM: '',
    });

    const { getEmailTransporter, isEmailConfigured, sendEmail } = await import('./email.js');

    expect(getEmailTransporter()).toBeNull();
    expect(isEmailConfigured()).toBe(false);
    await expect(sendEmail('to@example.com', 'Hello', '<p>Hi</p>', 'Hi')).resolves.toBe(false);
    expect(loggerMock.warn).toHaveBeenCalledWith('Email not configured, skipping send');
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('creates and caches a secure transporter with auth when smtp is configured', async () => {
    const transporter = { sendMail: vi.fn().mockResolvedValue(undefined) };
    configMock.mockReturnValue({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 465,
      SMTP_USER: 'alice',
      SMTP_PASS: 'secret',
      SMTP_FROM: 'news@example.com',
    });
    createTransportMock.mockReturnValue(transporter);

    const { getEmailTransporter, isEmailConfigured, sendEmail } = await import('./email.js');

    const first = getEmailTransporter();
    const second = getEmailTransporter();

    expect(first).toBe(transporter);
    expect(second).toBe(transporter);
    expect(isEmailConfigured()).toBe(true);
    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: { user: 'alice', pass: 'secret' },
    });

    await expect(sendEmail('to@example.com', 'Digest', '<p>Hello</p>', 'Hello')).resolves.toBe(true);
    expect(transporter.sendMail).toHaveBeenCalledWith({
      from: 'news@example.com',
      to: 'to@example.com',
      subject: 'Digest',
      html: '<p>Hello</p>',
      text: 'Hello',
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      { to: 'to@example.com', subject: 'Digest' },
      'Email sent',
    );
  });

  it('handles send failures and supports non-auth transport configs', async () => {
    const transporter = { sendMail: vi.fn().mockRejectedValue(new Error('smtp down')) };
    configMock.mockReturnValue({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 587,
      SMTP_USER: '',
      SMTP_PASS: '',
      SMTP_FROM: 'news@example.com',
    });
    createTransportMock.mockReturnValue(transporter);

    const { getEmailTransporter, sendEmail } = await import('./email.js');

    expect(getEmailTransporter()).toBe(transporter);
    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: undefined,
    });
    await expect(sendEmail('to@example.com', 'Digest', '<p>Hello</p>', 'Hello')).resolves.toBe(false);
    expect(loggerMock.error).toHaveBeenCalledWith(
      { to: 'to@example.com', subject: 'Digest', error: expect.any(Error) },
      'Failed to send email',
    );
  });
});
