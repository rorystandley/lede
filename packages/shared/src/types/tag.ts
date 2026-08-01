import type { ArticleTagSource } from '../constants.js';

export interface Tag {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  createdAt: string;
}

export interface ArticleTag {
  userId: string;
  articleId: string;
  tagId: string;
  source: ArticleTagSource;
  createdAt: string;
}

export interface TagWithCount extends Tag {
  articleCount: number;
}
