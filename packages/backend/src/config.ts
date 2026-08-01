import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(16),
  PORT: z.coerce.number().int().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  REGISTRATION_MODE: z.enum(['open', 'invite']).default('open'),

  // Email (optional — digest emails disabled if not set)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  APP_URL: z.string().url().default('http://localhost:5173'),

  // Web Push (optional — push notifications disabled if not set)
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),

  // Sentry (optional — error tracking disabled if not set)
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().default('production'),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

  // Process role — 'web', 'worker', or 'all' (default for single-process deployment)
  PROCESS_ROLE: z.enum(['web', 'worker', 'all']).default('all'),
});

export type Env = z.infer<typeof envSchema>;

let _config: Env | null = null;

export function loadConfig(): Env {
  if (_config) return _config;
  _config = envSchema.parse(process.env);
  return _config;
}

export function getConfig(): Env {
  if (!_config) throw new Error('Config not loaded. Call loadConfig() first.');
  return _config;
}
