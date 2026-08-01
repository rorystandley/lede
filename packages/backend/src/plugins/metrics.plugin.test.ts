import { beforeEach, describe, expect, it, vi } from 'vitest';
import metricsPlugin from './metrics.plugin.js';

vi.mock('../lib/metrics.js', () => ({
  registry: {
    contentType: 'text/plain',
    metrics: vi.fn().mockResolvedValue('metrics body'),
  },
  httpRequestsTotal: {
    inc: vi.fn(),
  },
  httpRequestDuration: {
    observe: vi.fn(),
  },
}));

describe('metrics.plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records request timing and exposes the metrics endpoint', async () => {
    const hooks = new Map<string, (req: Record<string, unknown>, reply?: Record<string, unknown>) => Promise<void>>();
    let metricsHandler: ((req: unknown, reply: { header: ReturnType<typeof vi.fn> }) => Promise<string>) | undefined;
    const { registry } = await import('../lib/metrics.js');
    vi.mocked(registry.metrics).mockResolvedValue('metrics body');

    await metricsPlugin({
      addHook: vi.fn((name, fn) => {
        hooks.set(name, fn);
      }),
      get: vi.fn((path, fn) => {
        if (path === '/metrics') metricsHandler = fn;
      }),
    } as never);

    const req = {
      method: 'GET',
      url: '/api/articles?foo=bar',
      routeOptions: { url: '/api/articles' },
    };
    const reply = { statusCode: 201 };

    vi.setSystemTime(new Date('2026-06-06T12:00:00.000Z'));
    await hooks.get('onRequest')!(req);
    vi.setSystemTime(new Date('2026-06-06T12:00:01.500Z'));
    await hooks.get('onResponse')!(req, reply);

    const { httpRequestsTotal, httpRequestDuration } = await import('../lib/metrics.js');
    expect(httpRequestsTotal.inc).toHaveBeenCalledWith({ method: 'GET', route: '/api/articles', status: '201' });
    expect(httpRequestDuration.observe).toHaveBeenCalledWith(
      { method: 'GET', route: '/api/articles', status: '201' },
      1.5,
    );

    const header = vi.fn();
    await expect(metricsHandler!(undefined, { header })).resolves.toBe('metrics body');
    expect(header).toHaveBeenCalledWith('Content-Type', registry.contentType);
    vi.useRealTimers();
  });

  it('skips response metrics when no request start time is present', async () => {
    const hooks = new Map<string, (req: Record<string, unknown>, reply?: Record<string, unknown>) => Promise<void>>();

    await metricsPlugin({
      addHook: vi.fn((name, fn) => {
        hooks.set(name, fn);
      }),
      get: vi.fn(),
    } as never);

    await hooks.get('onResponse')!(
      { method: 'GET', url: '/raw?x=1' },
      { statusCode: 200 },
    );

    const { httpRequestsTotal, httpRequestDuration } = await import('../lib/metrics.js');
    expect(httpRequestsTotal.inc).not.toHaveBeenCalled();
    expect(httpRequestDuration.observe).not.toHaveBeenCalled();
  });

  it('falls back to the raw request url when no route metadata exists', async () => {
    const hooks = new Map<string, (req: Record<string, unknown>, reply?: Record<string, unknown>) => Promise<void>>();

    await metricsPlugin({
      addHook: vi.fn((name, fn) => {
        hooks.set(name, fn);
      }),
      get: vi.fn(),
    } as never);

    const req = {
      method: 'POST',
      url: '/fallback-route?debug=1',
    };
    const reply = { statusCode: 202 };

    vi.setSystemTime(new Date('2026-06-06T12:00:00.000Z'));
    await hooks.get('onRequest')!(req);
    vi.setSystemTime(new Date('2026-06-06T12:00:02.000Z'));
    await hooks.get('onResponse')!(req, reply);

    const { httpRequestsTotal, httpRequestDuration } = await import('../lib/metrics.js');
    expect(httpRequestsTotal.inc).toHaveBeenCalledWith({ method: 'POST', route: '/fallback-route', status: '202' });
    expect(httpRequestDuration.observe).toHaveBeenCalledWith(
      { method: 'POST', route: '/fallback-route', status: '202' },
      2,
    );
    vi.useRealTimers();
  });
});
