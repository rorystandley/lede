import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getVapidPublicKeyMock: vi.fn(),
  isPushConfiguredMock: vi.fn(),
  sendPushToUserMock: vi.fn(),
  eqMock: vi.fn(),
  andMock: vi.fn(),
  insertValuesMock: vi.fn(),
  insertMock: vi.fn(),
  deleteWhereMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: mocks.eqMock,
  and: mocks.andMock,
}));

vi.mock('../db/schema/index.js', () => ({
  pushSubscriptions: {
    userId: 'push.userId',
    endpoint: 'push.endpoint',
  },
}));

vi.mock('../lib/push.js', () => ({
  getVapidPublicKey: mocks.getVapidPublicKeyMock,
  isPushConfigured: mocks.isPushConfiguredMock,
  sendPushToUser: mocks.sendPushToUserMock,
}));

vi.mock('../db/client.js', () => ({
  getDb: () => ({
    insert: mocks.insertMock,
    delete: mocks.deleteMock,
  }),
}));

let authenticatedUser = { id: 'user-1', email: 'reader@example.com' };

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (req) => {
    (req as typeof req & { user: typeof authenticatedUser }).user = authenticatedUser;
  });

  const { default: pushRoutes } = await import('./push.routes.js');
  await app.register(pushRoutes, { prefix: '/push' });
  return app;
}

describe('push.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertValuesMock.mockReturnValue({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) });
    mocks.insertMock.mockReturnValue({ values: mocks.insertValuesMock });
    mocks.deleteWhereMock.mockResolvedValue(undefined);
    mocks.deleteMock.mockReturnValue({ where: mocks.deleteWhereMock });
  });

  it('returns the public vapid key and enabled state', async () => {
    mocks.getVapidPublicKeyMock.mockReturnValue('public-key');
    mocks.isPushConfiguredMock.mockReturnValue(true);

    const app = await buildApp();

    try {
      const response = await app.inject({ method: 'GET', url: '/push/vapid-key' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ publicKey: 'public-key', enabled: true });
    } finally {
      await app.close();
    }
  });

  it('subscribes, unsubscribes, and sends a test push', async () => {
    mocks.eqMock.mockImplementation((left, right) => `${left}=${right}`);
    mocks.andMock.mockImplementation((...clauses) => clauses.join(' AND '));
    mocks.sendPushToUserMock.mockResolvedValue(1);

    const app = await buildApp();

    try {
      const subscribeResponse = await app.inject({
        method: 'POST',
        url: '/push/subscribe',
        payload: {
          endpoint: 'https://push.example/sub',
          keys: { p256dh: 'p256dh', auth: 'auth' },
          userAgent: 'Safari',
        },
      });
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: '/push/subscribe',
        payload: { endpoint: 'https://push.example/sub' },
      });
      const testResponse = await app.inject({
        method: 'POST',
        url: '/push/test',
      });

      expect(subscribeResponse.statusCode).toBe(201);
      expect(subscribeResponse.json()).toEqual({ ok: true });
      expect(mocks.insertValuesMock).toHaveBeenCalledWith({
        userId: 'user-1',
        endpoint: 'https://push.example/sub',
        p256dh: 'p256dh',
        auth: 'auth',
        userAgent: 'Safari',
      });

      expect(deleteResponse.statusCode).toBe(204);
      expect(mocks.deleteWhereMock).toHaveBeenCalledWith('push.userId=user-1 AND push.endpoint=https://push.example/sub');

      expect(testResponse.statusCode).toBe(200);
      expect(testResponse.json()).toEqual({ sent: 1 });
      expect(mocks.sendPushToUserMock).toHaveBeenCalledWith('user-1', {
        title: 'lede',
        body: 'Push notifications are working!',
        tag: 'test',
      });
    } finally {
      await app.close();
    }
  });

  it('serializes optional subscription fields and disabled vapid state', async () => {
    mocks.getVapidPublicKeyMock.mockReturnValue('public-key');
    mocks.isPushConfiguredMock.mockReturnValue(false);

    const app = await buildApp();

    try {
      const vapidResponse = await app.inject({ method: 'GET', url: '/push/vapid-key' });
      const subscribeResponse = await app.inject({
        method: 'POST',
        url: '/push/subscribe',
        payload: {
          endpoint: 'https://push.example/no-agent',
          keys: { p256dh: 'p256dh', auth: 'auth' },
        },
      });

      expect(vapidResponse.statusCode).toBe(200);
      expect(vapidResponse.json()).toEqual({ publicKey: 'public-key', enabled: false });
      expect(subscribeResponse.statusCode).toBe(201);
      expect(mocks.insertValuesMock).toHaveBeenCalledWith({
        userId: 'user-1',
        endpoint: 'https://push.example/no-agent',
        p256dh: 'p256dh',
        auth: 'auth',
        userAgent: null,
      });
    } finally {
      await app.close();
    }
  });
});
