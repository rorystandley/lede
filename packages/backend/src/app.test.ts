import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const existsSyncMock = vi.fn();
const initPushMock = vi.fn();
const initSentryMock = vi.fn();
const registerMcpRoutesMock = vi.fn(async (app: any) => {
  app.get('/mcp/ping', async () => ({ ok: true }));
});
const checkHealthMock = vi.fn(async () => ({ status: 'healthy', services: { db: 'up', redis: 'up' } }));

async function noopPlugin() {}

// Resolve the frontend dist path the same way app.ts does
const frontendDistDir = join(dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
const frontendIndexPath = join(frontendDistDir, 'index.html');

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
}));

vi.mock('@fastify/swagger', () => ({ default: noopPlugin }));
vi.mock('@fastify/swagger-ui', () => ({ default: noopPlugin }));

vi.mock('./plugins/error-handler.plugin.js', () => ({ default: noopPlugin }));
vi.mock('./plugins/auth.plugin.js', () => ({ default: noopPlugin }));
vi.mock('./plugins/rate-limit.plugin.js', () => ({ default: noopPlugin }));
vi.mock('./plugins/metrics.plugin.js', () => ({ default: noopPlugin }));

vi.mock('./routes/auth.routes.js', () => ({ default: noopPlugin }));
vi.mock('./routes/feeds.routes.js', () => ({ default: noopPlugin }));
vi.mock('./routes/articles.routes.js', () => ({ default: noopPlugin }));
vi.mock('./routes/folders.routes.js', () => ({ default: noopPlugin }));
vi.mock('./routes/tags.routes.js', () => ({ default: noopPlugin }));
vi.mock('./routes/search.routes.js', () => ({ default: noopPlugin }));
vi.mock('./routes/opml.routes.js', () => ({ default: noopPlugin }));
vi.mock('./routes/rules.routes.js', () => ({ default: noopPlugin }));
vi.mock('./routes/digests.routes.js', () => ({ default: noopPlugin }));
vi.mock('./routes/ai.routes.js', () => ({ default: noopPlugin }));
vi.mock('./routes/stats.routes.js', () => ({ default: noopPlugin }));
vi.mock('./routes/annotations.routes.js', () => ({ default: noopPlugin }));
vi.mock('./routes/sharing.routes.js', () => ({ default: noopPlugin }));
vi.mock('./routes/user.routes.js', () => ({ default: noopPlugin }));
vi.mock('./routes/discover.routes.js', () => ({ default: noopPlugin }));
vi.mock('./routes/push.routes.js', () => ({ default: noopPlugin }));

vi.mock('./mcp/server.js', () => ({
  registerMcpRoutes: registerMcpRoutesMock,
}));

vi.mock('./lib/email.js', () => ({
  isEmailConfigured: vi.fn(() => true),
}));

vi.mock('./lib/push.js', () => ({
  isPushConfigured: vi.fn(() => true),
  initPush: initPushMock,
}));

vi.mock('./lib/sentry.js', () => ({
  initSentry: initSentryMock,
  captureException: vi.fn(),
}));

vi.mock('./lib/health.js', () => ({
  checkHealth: checkHealthMock,
}));

let originalFrontendIndex: string | null = null;
let hadFrontendIndex = false;

describe('buildApp', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';

    try {
      originalFrontendIndex = await readFile(frontendIndexPath, 'utf8');
      hadFrontendIndex = true;
    } catch {
      originalFrontendIndex = null;
      hadFrontendIndex = false;
    }
  });

  afterEach(async () => {
    if (hadFrontendIndex && originalFrontendIndex !== null) {
      await mkdir(frontendDistDir, { recursive: true });
      await writeFile(frontendIndexPath, originalFrontendIndex, 'utf8');
    } else {
      await rm(frontendIndexPath, { force: true });
    }
  });

  it('serves health routes, mcp routes, and the packaged frontend when present', async () => {
    existsSyncMock.mockReturnValue(true);
    await mkdir(frontendDistDir, { recursive: true });
    await writeFile(frontendIndexPath, '<!doctype html><html><body><div id="root">frontend</div></body></html>', 'utf8');

    const { buildApp } = await import('./app.js');
    const app = await buildApp();

    const health = await app.inject({ method: 'GET', url: '/api/health' });
    const ready = await app.inject({ method: 'GET', url: '/api/health/ready' });
    const mcp = await app.inject({ method: 'GET', url: '/mcp/ping' });
    const frontend = await app.inject({
      method: 'GET',
      url: '/settings',
      headers: { accept: 'text/html' },
    });
    const backendMiss = await app.inject({
      method: 'GET',
      url: '/api/nope',
      headers: { accept: 'text/html' },
    });
    const nonHtml = await app.inject({
      method: 'GET',
      url: '/settings',
      headers: { accept: 'application/json' },
    });
    const capabilities = await app.inject({ method: 'GET', url: '/api/v1/delivery/capabilities' });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: 'ok' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'healthy', services: { db: 'up', redis: 'up' } });
    expect(mcp.statusCode).toBe(200);
    expect(mcp.json()).toEqual({ ok: true });
    expect(frontend.statusCode).toBe(200);
    expect(frontend.headers['content-type']).toContain('text/html');
    expect(frontend.body).toContain('<div id="root"');
    expect(backendMiss.statusCode).toBe(404);
    expect(nonHtml.statusCode).toBe(404);
    expect(capabilities.json()).toEqual({ email: true, push: true });
    expect(registerMcpRoutesMock).toHaveBeenCalled();
    expect(checkHealthMock).toHaveBeenCalled();
    expect(initPushMock).toHaveBeenCalled();
    expect(initSentryMock).toHaveBeenCalled();

    await app.close();
  });

  it('falls back to string path parsing when URL parsing fails and returns unhealthy readiness checks as 503', async () => {
    existsSyncMock.mockReturnValue(true);
    checkHealthMock.mockResolvedValueOnce({ status: 'unhealthy', services: { db: 'down', redis: 'up' } });
    await mkdir(frontendDistDir, { recursive: true });
    await writeFile(frontendIndexPath, '<!doctype html><html><body><div id="root">frontend</div></body></html>', 'utf8');

    const { buildApp } = await import('./app.js');
    const app = await buildApp();
    const NativeUrl = URL;
    const UrlMock = vi.fn((input: string | URL, base?: string | URL) => {
      if (typeof input === 'string' && input.startsWith('/broken-path')) {
        throw new TypeError('broken url');
      }
      return new NativeUrl(input, base);
    });
    Object.assign(UrlMock, NativeUrl);
    vi.stubGlobal('URL', UrlMock as unknown as typeof URL);

    try {
      const frontend = await app.inject({
        method: 'GET',
        url: '/broken-path?from=test',
        headers: { accept: 'text/html' },
      });
      const ready = await app.inject({ method: 'GET', url: '/api/health/ready' });

      expect(frontend.statusCode).toBe(200);
      expect(frontend.body).toContain('<div id="root"');
      expect(ready.statusCode).toBe(503);
      expect(ready.json()).toEqual({ status: 'unhealthy', services: { db: 'down', redis: 'up' } });
    } finally {
      vi.unstubAllGlobals();
      await app.close();
    }
  });

  it('treats query-only paths as the frontend root during string-path fallback parsing', async () => {
    existsSyncMock.mockReturnValue(true);
    await mkdir(frontendDistDir, { recursive: true });
    await writeFile(frontendIndexPath, '<!doctype html><html><body><div id="root">frontend</div></body></html>', 'utf8');

    const { buildApp } = await import('./app.js');
    const app = await buildApp();
    const NativeUrl = URL;
    const UrlMock = vi.fn((input: string | URL, base?: string | URL) => {
      if (typeof input === 'string' && input.startsWith('?')) {
        throw new TypeError('broken url');
      }
      return new NativeUrl(input, base);
    });
    Object.assign(UrlMock, NativeUrl);
    vi.stubGlobal('URL', UrlMock as unknown as typeof URL);

    try {
      const frontend = await app.inject({
        method: 'GET',
        url: '?from=test',
        headers: { accept: 'text/html' },
      });

      expect(frontend.statusCode).toBe(200);
      expect(frontend.body).toContain('<div id="root"');
    } finally {
      vi.unstubAllGlobals();
      await app.close();
    }
  });

  it('skips frontend fallback when the packaged frontend is missing in production', async () => {
    existsSyncMock.mockReturnValue(false);
    process.env.NODE_ENV = 'production';

    const { buildApp } = await import('./app.js');
    const app = await buildApp();

    const frontend = await app.inject({
      method: 'GET',
      url: '/settings',
      headers: { accept: 'text/html' },
    });

    expect(frontend.statusCode).toBe(404);

    await app.close();
  });
});
