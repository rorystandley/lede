import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getConfig } from '../config.js';
import rateLimitPlugin from './rate-limit.plugin.js';

vi.mock('../config.js', () => ({
  getConfig: vi.fn(),
}));

vi.mock('@fastify/rate-limit', () => ({
  default: Symbol('rate-limit-plugin'),
}));

describe('rate-limit.plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers the rate-limit plugin in production and keys by user id when present', async () => {
    vi.mocked(getConfig).mockReturnValue({ NODE_ENV: 'production' } as never);
    const register = vi.fn().mockResolvedValue(undefined);

    await rateLimitPlugin({ register } as never);

    expect(register).toHaveBeenCalledTimes(1);
    const [, options] = register.mock.calls[0];
    expect(options.max).toBe(100);
    expect(options.timeWindow).toBe('1 minute');
    expect(options.keyGenerator({ user: { id: 'user-1' }, ip: '127.0.0.1' })).toBe('user-1');
    expect(options.keyGenerator({ ip: '127.0.0.1' })).toBe('127.0.0.1');
  });

  it('skips registration outside production', async () => {
    vi.mocked(getConfig).mockReturnValue({ NODE_ENV: 'development' } as never);
    const register = vi.fn().mockResolvedValue(undefined);

    await rateLimitPlugin({ register } as never);

    expect(register).not.toHaveBeenCalled();
  });
});
