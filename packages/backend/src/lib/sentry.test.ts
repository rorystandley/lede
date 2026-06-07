import { afterEach, describe, expect, it, vi } from 'vitest';

describe('sentry helpers', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does not initialize without a DSN and ignores capture requests before init', async () => {
    const init = vi.fn();
    const captureException = vi.fn();

    vi.doMock('@sentry/node', () => ({
      init,
      captureException,
    }));
    vi.doMock('../config.js', () => ({
      getConfig: vi.fn(() => ({
        SENTRY_DSN: undefined,
        SENTRY_ENVIRONMENT: 'production',
        SENTRY_TRACES_SAMPLE_RATE: 0.1,
      })),
    }));
    vi.doMock('./logger.js', () => ({
      getLogger: vi.fn(() => ({ info: vi.fn() })),
    }));

    const sentry = await import('./sentry.js');

    expect(sentry.initSentry()).toBe(false);
    sentry.captureException(new Error('ignored'), { userId: 'user-1' });

    expect(init).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('initializes once, logs setup, and forwards captured exceptions with context', async () => {
    const init = vi.fn();
    const captureException = vi.fn();
    const info = vi.fn();

    vi.doMock('@sentry/node', () => ({
      init,
      captureException,
    }));
    vi.doMock('../config.js', () => ({
      getConfig: vi.fn(() => ({
        SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/1',
        SENTRY_ENVIRONMENT: 'production',
        SENTRY_TRACES_SAMPLE_RATE: 0.25,
      })),
    }));
    vi.doMock('./logger.js', () => ({
      getLogger: vi.fn(() => ({ info })),
    }));

    const sentry = await import('./sentry.js');

    expect(sentry.initSentry()).toBe(true);
    expect(sentry.initSentry()).toBe(true);
    sentry.captureException(new Error('boom'), { articleId: 'article-1' });
    sentry.captureException('plain failure');

    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith({
      dsn: 'https://examplePublicKey@o0.ingest.sentry.io/1',
      environment: 'production',
      tracesSampleRate: 0.25,
    });
    expect(info).toHaveBeenCalledWith({ env: 'production' }, 'Sentry initialized');
    expect(captureException).toHaveBeenNthCalledWith(1, expect.any(Error), {
      extra: { articleId: 'article-1' },
    });
    expect(captureException).toHaveBeenNthCalledWith(2, 'plain failure', undefined);
  });
});
