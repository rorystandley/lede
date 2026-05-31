export interface SearchFilters {
  feedIds?: string[];
  folderIds?: string[];
  tagIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  isRead?: boolean;
  isStarred?: boolean;
}

export interface SavedSearch {
  id: string;
  userId: string;
  name: string;
  query: string;
  filters: SearchFilters | null;
  isMonitor: boolean;
  createdAt: string;
}
