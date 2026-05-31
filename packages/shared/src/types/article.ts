export interface Article {
  id: string;
  feedId: string;
  guid: string;
  url: string | null;
  title: string | null;
  author: string | null;
  summary: string | null;
  contentHtml: string | null;
  contentText: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  wordCount: number;
  createdAt: string;
}

export interface UserArticleState {
  id: string;
  userId: string;
  articleId: string;
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  readAt: string | null;
  readingTimeMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface ArticleWithState extends Article {
  feedTitle: string | null;
  feedFaviconUrl: string | null;
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  tags: { id: string; name: string; color: string | null }[];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
