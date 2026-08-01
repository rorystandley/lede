import { describe, expect, it, vi } from 'vitest';
import errorHandlerPlugin from './error-handler.plugin.js';

vi.mock('../lib/sentry.js', () => ({
  captureException: vi.fn(),
}));

describe('error-handler.plugin', () => {
  it('registers sensible and captures server errors', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    let handler: ((err: { statusCode?: number }, req: { method: string; url: string; user?: { id: string }; log: { error: ReturnType<typeof vi.fn> } }, reply: { send: ReturnType<typeof vi.fn> }) => void) | undefined;
    const setErrorHandler = vi.fn((fn) => {
      handler = fn;
    });
    const req = {
      method: 'GET',
      url: '/boom',
      user: { id: 'user-1' },
      log: { error: vi.fn() },
    };
    const reply = { send: vi.fn() };

    const { captureException } = await import('../lib/sentry.js');
    await errorHandlerPlugin({ register, setErrorHandler } as never);

    expect(register).toHaveBeenCalledTimes(1);
    expect(handler).toBeDefined();

    handler!({ statusCode: 500 } as never, req as never, reply as never);
    expect(captureException).toHaveBeenCalledWith(
      { statusCode: 500 },
      { method: 'GET', url: '/boom', userId: 'user-1' },
    );
    expect(req.log.error).toHaveBeenCalledWith({ err: { statusCode: 500 } }, 'Unhandled error');
    expect(reply.send).toHaveBeenCalledWith({ statusCode: 500 });
  });

  it('does not capture handled client errors', async () => {
    let handler: ((err: { statusCode?: number }, req: { method: string; url: string; log: { error: ReturnType<typeof vi.fn> } }, reply: { send: ReturnType<typeof vi.fn> }) => void) | undefined;
    const { captureException } = await import('../lib/sentry.js');

    await errorHandlerPlugin({
      register: vi.fn().mockResolvedValue(undefined),
      setErrorHandler: vi.fn((fn) => {
        handler = fn;
      }),
    } as never);

    const req = { method: 'POST', url: '/bad', log: { error: vi.fn() } };
    const reply = { send: vi.fn() };
    handler!({ statusCode: 400 } as never, req as never, reply as never);

    expect(captureException).not.toHaveBeenCalled();
    expect(req.log.error).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith({ statusCode: 400 });
  });
});
