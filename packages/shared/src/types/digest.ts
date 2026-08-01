import type { DigestStatus } from '../constants.js';

export interface DigestArticleSummary {
  id: string;
  title: string | null;
  url: string | null;
  feedTitle: string | null;
  publishedAt: string | null;
  summary: string | null;
  aiSummary: string | null;
}

export interface DigestSection {
  folder: string | null;
  feeds: {
    feedId: string;
    feedTitle: string | null;
    articles: DigestArticleSummary[];
  }[];
}

export interface DigestContent {
  date: string;
  briefing: string | null;
  sections: DigestSection[];
  stats: {
    totalArticles: number;
    estimatedReadTimeMin: number;
  };
}

export interface Digest {
  id: string;
  userId: string;
  scheduledFor: string;
  deliveredAt: string | null;
  articleCount: number;
  status: DigestStatus;
  content: DigestContent | null;
  createdAt: string;
}
