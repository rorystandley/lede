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

interface DiscoveredFeed {
  url: string;
  title: string | null;
  description: string | null;
  siteUrl: string | null;
  feedType: string;
  itemCount: number;
}

interface DiscoverResult {
  query: string;
  feeds: DiscoveredFeed[];
}

export const discoverApi = {
  directory: (params?: { category?: string; q?: string }) => {
    const query = new URLSearchParams();
    if (params?.category) query.set('category', params.category);
    if (params?.q) query.set('q', params.q);
    const qs = query.toString();
    return api.get<DirectoryResponse>(`/discover/directory/subscribed${qs ? `?${qs}` : ''}`);
  },

  // Accepts a site URL ("theregister.com") or a direct feed URL and returns
  // every feed we can find for it.
  discover: (url: string) =>
    api.post<DiscoverResult>('/discover/feeds', { url }),
};

export type { DirectoryFeed, DirectoryResponse, DiscoveredFeed, DiscoverResult };
