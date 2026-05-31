import { api } from './client.js';
import type { Digest } from '@news-reader/shared';

export const digestsApi = {
  latest: () => api.get<Digest>('/digests/latest'),
  build: () => api.post<Digest>('/digests/build'),
  list: () => api.get<Digest[]>('/digests'),
  markDelivered: (digestId: string) => api.patch(`/digests/${digestId}/delivered`),
};
