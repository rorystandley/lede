import { afterEach, describe, expect, it, vi } from 'vitest';

describe('backend entrypoint', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('starts workers in-process when PROCESS_ROLE=all and shuts them down cleanly', async () => {
    const dotenvConfig = vi.fn();
    const listen = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const info = vi.fn();
    const app = { listen, close, log: { info } };
    const setupRecurringJobs = vi.fn().mockResolvedValue(undefined);
    const closeQueues = vi.fn().mockResolvedValue(undefined);
    const closeDb = vi.fn().mockResolvedValue(undefined);
    const workerClose = vi.fn().mockResolvedValue(undefined);
    const handlers = new Map<string, () => Promise<void>>();
    const onSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, handler: () => Promise<void>) => {
      handlers.set(event, handler);
      return process;
    }) as never);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => code as never) as never);

    vi.doMock('dotenv', () => ({
      default: {
        config: dotenvConfig,
      },
    }));
    vi.doMock('./app.js', () => ({
      buildApp: vi.fn().mockResolvedValue(app),
    }));
    vi.doMock('./config.js', () => ({
      getConfig: vi.fn(() => ({ PORT: 4321, PROCESS_ROLE: 'all' })),
    }));
    vi.doMock('./queues/index.js', () => ({
      setupRecurringJobs,
      closeQueues,
    }));
    vi.doMock('./workers/feed-refresh.worker.js', () => ({
      createFeedRefreshWorker: vi.fn(() => ({ close: workerClose })),
    }));
    vi.doMock('./workers/rule-engine.worker.js', () => ({
      createRuleEngineWorker: vi.fn(() => ({ close: workerClose })),
    }));
    vi.doMock('./workers/digest-build.worker.js', () => ({
      createDigestBuildWorker: vi.fn(() => ({ close: workerClose })),
    }));
    vi.doMock('./workers/content-extract.worker.js', () => ({
      createContentExtractWorker: vi.fn(() => ({ close: workerClose })),
    }));
    vi.doMock('./db/client.js', () => ({
      closeDb,
    }));

    await import('./index.js');

    expect(dotenvConfig).toHaveBeenCalledWith({ path: '../../.env' });
    expect(listen).toHaveBeenCalledWith({ port: 4321, host: '0.0.0.0' });
    expect(setupRecurringJobs).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith('Workers running in-process (PROCESS_ROLE=all)');
    expect(info).toHaveBeenCalledWith('Server listening on http://localhost:4321');
    expect(info).toHaveBeenCalledWith('API docs at http://localhost:4321/api/docs');
    expect(onSpy).toHaveBeenCalledTimes(2);
    expect(handlers.has('SIGINT')).toBe(true);
    expect(handlers.has('SIGTERM')).toBe(true);

    await handlers.get('SIGINT')!();

    expect(info).toHaveBeenCalledWith('Shutting down...');
    expect(workerClose).toHaveBeenCalledTimes(4);
    expect(closeQueues).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(closeDb).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('skips in-process workers when PROCESS_ROLE is not all', async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const info = vi.fn();
    const app = { listen, close, log: { info } };
    const setupRecurringJobs = vi.fn().mockResolvedValue(undefined);
    const closeQueues = vi.fn().mockResolvedValue(undefined);
    const closeDb = vi.fn().mockResolvedValue(undefined);
    const handlers = new Map<string, () => Promise<void>>();
    vi.spyOn(process, 'on').mockImplementation(((event: string, handler: () => Promise<void>) => {
      handlers.set(event, handler);
      return process;
    }) as never);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => code as never) as never);

    vi.doMock('dotenv', () => ({
      default: {
        config: vi.fn(),
      },
    }));
    vi.doMock('./app.js', () => ({
      buildApp: vi.fn().mockResolvedValue(app),
    }));
    vi.doMock('./config.js', () => ({
      getConfig: vi.fn(() => ({ PORT: 3000, PROCESS_ROLE: 'web' })),
    }));
    vi.doMock('./queues/index.js', () => ({
      setupRecurringJobs,
      closeQueues,
    }));
    vi.doMock('./workers/feed-refresh.worker.js', () => ({
      createFeedRefreshWorker: vi.fn(() => ({ close: vi.fn() })),
    }));
    vi.doMock('./workers/rule-engine.worker.js', () => ({
      createRuleEngineWorker: vi.fn(() => ({ close: vi.fn() })),
    }));
    vi.doMock('./workers/digest-build.worker.js', () => ({
      createDigestBuildWorker: vi.fn(() => ({ close: vi.fn() })),
    }));
    vi.doMock('./workers/content-extract.worker.js', () => ({
      createContentExtractWorker: vi.fn(() => ({ close: vi.fn() })),
    }));
    vi.doMock('./db/client.js', () => ({
      closeDb,
    }));

    await import('./index.js');

    expect(setupRecurringJobs).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      'Workers NOT running in this process (PROCESS_ROLE=web). Run packages/backend/dist/worker.js separately.',
    );

    await handlers.get('SIGTERM')!();

    expect(closeQueues).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(closeDb).toHaveBeenCalledTimes(1);
  });
});
