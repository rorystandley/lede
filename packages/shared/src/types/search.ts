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
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSavedSearchInput {
  name: string;
  query: string;
  filters?: SearchFilters;
  isMonitor?: boolean;
}

export interface UpdateSavedSearchInput {
  name?: string;
  query?: string;
  filters?: SearchFilters | null;
  isMonitor?: boolean;
}
