import { api } from './client.js';
import { useAuthStore } from '../stores/auth.store.js';

export const opmlApi = {
  importOpml: (opml: string) =>
    api.post<{ imported: number; failed: number; errors: string[] }>('/opml/import', { opml }),

  exportOpml: async () => {
    const { accessToken } = useAuthStore.getState();
    const res = await fetch('/api/v1/opml/export', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error('Export failed');
    return res.text();
  },
};
