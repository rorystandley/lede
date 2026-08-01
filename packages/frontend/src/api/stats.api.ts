import { api } from './client.js';

interface StatsSummary {
  totalArticlesRead: number;
  totalStarred: number;
  totalFeeds: number;
  weeklyArticlesRead: number;
  weeklyReadingTimeMin: number;
}

interface DailyStat {
  id: string;
  date: string;
  articlesRead: number;
  totalTimeMs: number;
}

export const statsApi = {
  summary: () => api.get<StatsSummary>('/stats/summary'),
  daily: (days?: number) => api.get<DailyStat[]>(`/stats/daily${days ? `?days=${days}` : ''}`),
  track: (articleId: string, readingTimeMs: number) =>
    api.post('/stats/track', { articleId, readingTimeMs }),
};
