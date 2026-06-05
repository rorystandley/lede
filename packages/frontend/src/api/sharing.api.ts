import { api } from './client.js';

interface ShareArticleData {
  title: string;
  url: string | null;
  author: string | null;
  summary: string | null;
  publishedAt: string | null;
  feedTitle: string;
  shareUrl: string;
}

export const sharingApi = {
  getShareData: (articleId: string) =>
    api.get<ShareArticleData>(`/share/article/${articleId}`),
};
