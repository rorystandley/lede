import { afterEach, describe, expect, it, vi } from 'vitest';

describe('push helpers', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('reports configuration status and skips initialization when VAPID keys are missing', async () => {
    const setVapidDetails = vi.fn();

    vi.doMock('web-push', () => ({
      default: {
        setVapidDetails,
        sendNotification: vi.fn(),
      },
    }));
    vi.doMock('../config.js', () => ({
      getConfig: vi.fn(() => ({
        VAPID_PUBLIC_KEY: undefined,
        VAPID_PRIVATE_KEY: undefined,
        VAPID_SUBJECT: 'mailto:test@example.com',
      })),
    }));
    vi.doMock('../db/client.js', () => ({
      getDb: vi.fn(),
    }));
    vi.doMock('./logger.js', () => ({
      getLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
    }));
    vi.doMock('../db/schema/index.js', () => ({
      pushSubscriptions: { userId: 'pushSubscriptions.userId', id: 'pushSubscriptions.id' },
    }));
    vi.doMock('drizzle-orm', () => ({
      eq: vi.fn((left, right) => `${left}:${right}`),
    }));

    const push = await import('./push.js');

    expect(push.isPushConfigured()).toBe(false);
    expect(push.getVapidPublicKey()).toBeNull();
    expect(push.initPush()).toBe(false);
    await expect(push.sendPushToUser('user-1', { title: 'A', body: 'B' })).resolves.toBe(0);
    expect(setVapidDetails).not.toHaveBeenCalled();
  });

  it('initializes push once and returns zero when a user has no subscriptions', async () => {
    const setVapidDetails = vi.fn();
    const where = vi.fn().mockResolvedValue([]);
    const from = vi.fn(() => ({ where }));

    vi.doMock('web-push', () => ({
      default: {
        setVapidDetails,
        sendNotification: vi.fn(),
      },
    }));
    vi.doMock('../config.js', () => ({
      getConfig: vi.fn(() => ({
        VAPID_PUBLIC_KEY: 'public-key',
        VAPID_PRIVATE_KEY: 'private-key',
        VAPID_SUBJECT: 'mailto:test@example.com',
      })),
    }));
    vi.doMock('../db/client.js', () => ({
      getDb: vi.fn(() => ({
        select: vi.fn(() => ({ from })),
      })),
    }));
    vi.doMock('./logger.js', () => ({
      getLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
    }));
    vi.doMock('../db/schema/index.js', () => ({
      pushSubscriptions: { userId: 'pushSubscriptions.userId', id: 'pushSubscriptions.id' },
    }));
    vi.doMock('drizzle-orm', () => ({
      eq: vi.fn((left, right) => `${left}:${right}`),
    }));

    const push = await import('./push.js');

    expect(push.isPushConfigured()).toBe(true);
    expect(push.getVapidPublicKey()).toBe('public-key');
    expect(push.initPush()).toBe(true);
    expect(push.initPush()).toBe(true);
    await expect(push.sendPushToUser('user-1', { title: 'A', body: 'B' })).resolves.toBe(0);

    expect(setVapidDetails).toHaveBeenCalledTimes(1);
    expect(setVapidDetails).toHaveBeenCalledWith('mailto:test@example.com', 'public-key', 'private-key');
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('sends push notifications, removes stale subscriptions, and logs non-stale failures', async () => {
    const setVapidDetails = vi.fn();
    const sendNotification = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockRejectedValueOnce(new Error('network failure'));
    const info = vi.fn();
    const error = vi.fn();
    const subscriptions = [
      { id: 'sub-1', endpoint: 'https://push.example/1', p256dh: 'key-1', auth: 'auth-1' },
      { id: 'sub-2', endpoint: 'https://push.example/2', p256dh: 'key-2', auth: 'auth-2' },
      { id: 'sub-3', endpoint: 'https://push.example/3', p256dh: 'key-3', auth: 'auth-3' },
    ];
    const selectWhere = vi.fn().mockResolvedValue(subscriptions);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const deleteWhere = vi.fn().mockResolvedValue(undefined);

    vi.doMock('web-push', () => ({
      default: {
        setVapidDetails,
        sendNotification,
      },
    }));
    vi.doMock('../config.js', () => ({
      getConfig: vi.fn(() => ({
        VAPID_PUBLIC_KEY: 'public-key',
        VAPID_PRIVATE_KEY: 'private-key',
        VAPID_SUBJECT: 'mailto:test@example.com',
      })),
    }));
    vi.doMock('../db/client.js', () => ({
      getDb: vi.fn(() => ({
        select: vi.fn(() => ({ from: selectFrom })),
        delete: vi.fn(() => ({ where: deleteWhere })),
      })),
    }));
    vi.doMock('./logger.js', () => ({
      getLogger: vi.fn(() => ({ info, error })),
    }));
    vi.doMock('../db/schema/index.js', () => ({
      pushSubscriptions: { userId: 'pushSubscriptions.userId', id: 'pushSubscriptions.id' },
    }));
    vi.doMock('drizzle-orm', () => ({
      eq: vi.fn((left, right) => `${left}:${right}`),
    }));

    const push = await import('./push.js');

    await expect(
      push.sendPushToUser('user-1', { title: 'Digest', body: 'Ready', url: 'https://app.example/digest' }),
    ).resolves.toBe(1);

    expect(sendNotification).toHaveBeenNthCalledWith(1, {
      endpoint: 'https://push.example/1',
      keys: { p256dh: 'key-1', auth: 'auth-1' },
    }, JSON.stringify({ title: 'Digest', body: 'Ready', url: 'https://app.example/digest' }));
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith({ subId: 'sub-2' }, 'Removed stale push subscription');
    expect(error).toHaveBeenCalledWith(
      { subId: 'sub-3', error: expect.any(Error) },
      'Failed to send push notification',
    );
  });
});
