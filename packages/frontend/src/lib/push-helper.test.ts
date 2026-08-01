import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPushPermission,
  isCurrentlySubscribed,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from './push-helper.js';

const {
  vapidKeyMock,
  pushSubscribeApiMock,
  pushUnsubscribeApiMock,
} = vi.hoisted(() => ({
  vapidKeyMock: vi.fn(),
  pushSubscribeApiMock: vi.fn(),
  pushUnsubscribeApiMock: vi.fn(),
}));

vi.mock('../api/push.api.js', () => ({
  pushApi: {
    vapidKey: vapidKeyMock,
    subscribe: pushSubscribeApiMock,
    unsubscribe: pushUnsubscribeApiMock,
  },
}));

describe('push helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'PushManager', {
      configurable: true,
      value: function PushManager() {},
    });
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: 'default',
        requestPermission: vi.fn().mockResolvedValue('granted'),
      },
    });
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(null),
            subscribe: vi.fn().mockResolvedValue({
              endpoint: 'https://push.example/sub',
              toJSON: () => ({ keys: { p256dh: 'p-key', auth: 'a-key' } }),
            }),
          },
        }),
      },
    });
    vapidKeyMock.mockResolvedValue({
      publicKey: 'QUJDRA',
      enabled: true,
    });
  });

  it('detects push support and current permission', async () => {
    expect(await isPushSupported()).toBe(true);
    expect(await getPushPermission()).toBe('default');

    const originalNotification = window.Notification;
    Reflect.deleteProperty(window, 'Notification');
    expect(await getPushPermission()).toBe('denied');
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: originalNotification,
    });
  });

  it('returns unsupported and denied states before subscribing', async () => {
    Reflect.deleteProperty(window.navigator, 'serviceWorker');
    expect(await subscribeToPush()).toEqual({
      ok: false,
      error: 'Push not supported in this browser',
    });

    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(null),
            subscribe: vi.fn(),
          },
        }),
      },
    });
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: 'default',
        requestPermission: vi.fn().mockResolvedValue('denied'),
      },
    });

    expect(await subscribeToPush()).toEqual({
      ok: false,
      error: 'Permission denied',
    });
  });

  it('rejects server misconfiguration and subscribes successfully', async () => {
    vapidKeyMock.mockResolvedValueOnce({ publicKey: null, enabled: false });
    expect(await subscribeToPush()).toEqual({
      ok: false,
      error: 'Push not configured on server',
    });

    const existingUnsubscribe = vi.fn().mockResolvedValue(undefined);
    const getSubscription = vi.fn().mockResolvedValueOnce({
      endpoint: 'https://push.example/old',
      unsubscribe: existingUnsubscribe,
    });
    const subscribe = vi.fn().mockResolvedValue({
      endpoint: 'https://push.example/new',
      toJSON: () => ({ keys: { p256dh: 'new-p', auth: 'new-a' } }),
    });

    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription,
            subscribe,
          },
        }),
      },
    });

    expect(await subscribeToPush()).toEqual({ ok: true });
    expect(existingUnsubscribe).toHaveBeenCalled();
    expect(pushSubscribeApiMock).toHaveBeenCalledWith({
      endpoint: 'https://push.example/new',
      keys: { p256dh: 'new-p', auth: 'new-a' },
      userAgent: navigator.userAgent,
    });
  });

  it('checks and removes existing subscriptions', async () => {
    const unsubscribeMock = vi.fn().mockResolvedValue(undefined);
    const getSubscription = vi.fn()
      .mockResolvedValueOnce({
        endpoint: 'https://push.example/sub',
        unsubscribe: unsubscribeMock,
      })
      .mockResolvedValueOnce({
        endpoint: 'https://push.example/sub',
        unsubscribe: unsubscribeMock,
      })
      .mockResolvedValueOnce(null);

    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription,
            subscribe: vi.fn(),
          },
        }),
      },
    });

    expect(await isCurrentlySubscribed()).toBe(true);
    await unsubscribeFromPush();
    expect(pushUnsubscribeApiMock).toHaveBeenCalledWith('https://push.example/sub');
    expect(unsubscribeMock).toHaveBeenCalled();
    expect(await isCurrentlySubscribed()).toBe(false);
  });

  it('treats unsupported browsers as unsubscribed without touching service worker state', async () => {
    Reflect.deleteProperty(window.navigator, 'serviceWorker');

    expect(await isCurrentlySubscribed()).toBe(false);
  });
});
