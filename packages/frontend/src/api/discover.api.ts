import { api } from './client.js';

interface DirectoryFeed {
  name: string;
  url: string;
  siteUrl: string;
  description: string;
  category: string;
  isSubscribed: boolean;
}

interface DirectoryResponse {
  categories: string[];
  feeds: DirectoryFeed[];
}

interface DetectResult {
  valid: boolean;
  title?: string;
  description?: string;
  siteUrl?: string;
  itemCount?: number;
  url: string;
  error?: string;
}

export const discoverApi = {
  directory: (params?: { category?: string; q?: string }) => {
    const query = new URLSearchParams();
    if (params?.category) query.set('category', params.category);
    if (params?.q) query.set('q', params.q);
    const qs = query.toString();
    return api.get<DirectoryResponse>(`/discover/directory/subscribed${qs ? `?${qs}` : ''}`);
  },

  detect: (url: string) =>
    api.post<DetectResult>('/discover/detect', { url }),
};

export type { DirectoryFeed, DirectoryResponse, DetectResult };
