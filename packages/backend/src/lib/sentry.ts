import * as Sentry from '@sentry/node';
import { getConfig } from '../config.js';
import { getLogger } from './logger.js';

let _initialized = false;

export function initSentry(): boolean {
  if (_initialized) return true;
  const config = getConfig();
  if (!config.SENTRY_DSN) return false;

  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.SENTRY_ENVIRONMENT,
    tracesSampleRate: config.SENTRY_TRACES_SAMPLE_RATE,
  });
  _initialized = true;
  getLogger().info({ env: config.SENTRY_ENVIRONMENT }, 'Sentry initialized');
  return true;
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!_initialized) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export { Sentry };
