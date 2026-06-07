import { afterEach, describe, expect, it, vi } from 'vitest';

describe('getLogger', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('creates and caches a pino logger using the configured level', async () => {
    const createdLogger = { child: vi.fn() };
    const pino = vi.fn(() => createdLogger);

    vi.doMock('pino', () => ({
      default: pino,
    }));
    vi.doMock('../config.js', () => ({
      getConfig: vi.fn(() => ({ LOG_LEVEL: 'debug' })),
    }));

    const { getLogger } = await import('./logger.js');

    expect(getLogger()).toBe(createdLogger);
    expect(getLogger()).toBe(createdLogger);
    expect(pino).toHaveBeenCalledTimes(1);
    expect(pino).toHaveBeenCalledWith({ level: 'debug' });
  });
});
