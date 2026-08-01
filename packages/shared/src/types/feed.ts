import type { FeedType } from '../constants.js';

export interface Feed {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  siteUrl: string | null;
  faviconUrl: string | null;
  feedType: FeedType;
  lastFetchedAt: string | null;
  lastError: string | null;
  errorCount: number;
  refreshInterval: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserFeedSubscription {
  id: string;
  userId: string;
  feedId: string;
  folderId: string | null;
  customTitle: string | null;
  notify: boolean;
  createdAt: string;
}

export interface SubscribedFeed extends Feed {
  subscriptionId: string;
  folderId: string | null;
  customTitle: string | null;
  notify: boolean;
  unreadCount: number;
}
