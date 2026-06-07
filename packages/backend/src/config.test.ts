import { afterEach, describe, expect, it, vi } from 'vitest';

const baseEnv = {
  DATABASE_URL: 'https://db.example.com',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: '1234567890abcdef',
  JWT_REFRESH_SECRET: '1234567890abcdef',
  ENCRYPTION_KEY: '1234567890abcdef',
};

async function importFreshConfig() {
  vi.resetModules();
  return import('./config.js');
}

describe('config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws when config is requested before it has been loaded', async () => {
    const { getConfig } = await importFreshConfig();

    expect(() => getConfig()).toThrow('Config not loaded. Call loadConfig() first.');
  });

  it('loads defaults and memoizes the parsed config object', async () => {
    Object.entries(baseEnv).forEach(([key, value]) => vi.stubEnv(key, value));

    const { loadConfig, getConfig } = await importFreshConfig();
    const first = loadConfig();
    vi.stubEnv('PORT', '9090');
    const second = loadConfig();

    expect(first).toBe(second);
    expect(getConfig()).toBe(first);
    expect(first).toMatchObject({
      DATABASE_URL: 'https://db.example.com',
      REDIS_URL: 'redis://localhost:6379',
      PORT: 3000,
      NODE_ENV: 'test',
      LOG_LEVEL: 'info',
      REGISTRATION_MODE: 'open',
      APP_URL: 'http://localhost:5173',
      VAPID_SUBJECT: 'mailto:admin@example.com',
      SENTRY_ENVIRONMENT: 'production',
      SENTRY_TRACES_SAMPLE_RATE: 0.1,
      PROCESS_ROLE: 'all',
    });
  });

  it('parses explicitly provided optional values', async () => {
    Object.entries({
      ...baseEnv,
      PORT: '4567',
      NODE_ENV: 'production',
      LOG_LEVEL: 'debug',
      REGISTRATION_MODE: 'invite',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '2525',
      SMTP_USER: 'mailer',
      SMTP_PASS: 'secret',
      SMTP_FROM: 'news@example.com',
      APP_URL: 'https://news.example.com',
      VAPID_PUBLIC_KEY: 'public',
      VAPID_PRIVATE_KEY: 'private',
      VAPID_SUBJECT: 'mailto:ops@example.com',
      SENTRY_DSN: 'https://public@example.com/1',
      SENTRY_ENVIRONMENT: 'staging',
      SENTRY_TRACES_SAMPLE_RATE: '0.5',
      PROCESS_ROLE: 'worker',
    }).forEach(([key, value]) => vi.stubEnv(key, value));

    const { loadConfig } = await importFreshConfig();

    expect(loadConfig()).toMatchObject({
      PORT: 4567,
      NODE_ENV: 'production',
      LOG_LEVEL: 'debug',
      REGISTRATION_MODE: 'invite',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 2525,
      SMTP_USER: 'mailer',
      SMTP_PASS: 'secret',
      SMTP_FROM: 'news@example.com',
      APP_URL: 'https://news.example.com',
      VAPID_PUBLIC_KEY: 'public',
      VAPID_PRIVATE_KEY: 'private',
      VAPID_SUBJECT: 'mailto:ops@example.com',
      SENTRY_DSN: 'https://public@example.com/1',
      SENTRY_ENVIRONMENT: 'staging',
      SENTRY_TRACES_SAMPLE_RATE: 0.5,
      PROCESS_ROLE: 'worker',
    });
  });
});
