import { api } from './client.js';

interface VapidKey { publicKey: string | null; enabled: boolean }

export const pushApi = {
  vapidKey: () => api.get<VapidKey>('/push/vapid-key'),

  subscribe: (sub: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string }) =>
    api.post<{ ok: boolean }>('/push/subscribe', sub),

  unsubscribe: async (endpoint: string) => {
    // backend expects body for DELETE — use fetch directly
    const { useAuthStore } = await import('../stores/auth.store.js');
    const token = useAuthStore.getState().accessToken;
    await fetch('/api/v1/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint }),
    });
  },

  test: () => api.post<{ sent: number }>('/push/test'),
};

export const deliveryApi = {
  capabilities: () => api.get<{ email: boolean; push: boolean }>('/delivery/capabilities'),
};
