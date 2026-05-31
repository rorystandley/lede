import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ViewMode } from '@news-reader/shared';

interface UiState {
  theme: 'light' | 'dark';
  viewMode: ViewMode;
  sidebarOpen: boolean;
  selectedFeedId: string | null;
  selectedFolderId: string | null;
  selectedTagId: string | null;
  selectedArticleId: string | null;
  focusedArticleIndex: number;
  searchQuery: string;
  isSearching: boolean;
  showStarred: boolean;
  toggleTheme: () => void;
  setViewMode: (mode: ViewMode) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  selectFeed: (feedId: string | null) => void;
  selectFolder: (folderId: string | null) => void;
  selectTag: (tagId: string | null) => void;
  selectArticle: (articleId: string | null) => void;
  setFocusedArticleIndex: (index: number) => void;
  setSearchQuery: (query: string) => void;
  setIsSearching: (searching: boolean) => void;
  setShowStarred: (starred: boolean) => void;
  clearFilters: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      viewMode: 'list',
      sidebarOpen: true,
      selectedFeedId: null,
      selectedFolderId: null,
      selectedTagId: null,
      selectedArticleId: null,
      focusedArticleIndex: 0,
      searchQuery: '',
      isSearching: false,
      showStarred: false,
      toggleTheme: () => {
        const next = get().theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        set({ theme: next });
      },
      setViewMode: (viewMode) => set({ viewMode }),
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      selectFeed: (feedId) => set({ selectedFeedId: feedId, selectedFolderId: null, selectedTagId: null, selectedArticleId: null, focusedArticleIndex: 0, isSearching: false, showStarred: false }),
      selectFolder: (folderId) => set({ selectedFolderId: folderId, selectedFeedId: null, selectedTagId: null, selectedArticleId: null, focusedArticleIndex: 0, isSearching: false, showStarred: false }),
      selectTag: (tagId) => set({ selectedTagId: tagId, selectedFeedId: null, selectedFolderId: null, selectedArticleId: null, focusedArticleIndex: 0, isSearching: false, showStarred: false }),
      selectArticle: (articleId) => set({ selectedArticleId: articleId }),
      setFocusedArticleIndex: (index) => set({ focusedArticleIndex: index }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setIsSearching: (isSearching) => set({ isSearching, selectedFeedId: null, selectedFolderId: null, selectedTagId: null, selectedArticleId: null, focusedArticleIndex: 0, showStarred: false }),
      setShowStarred: (showStarred) => set({ showStarred, selectedFeedId: null, selectedFolderId: null, selectedTagId: null, selectedArticleId: null, focusedArticleIndex: 0, isSearching: false }),
      clearFilters: () => set({ selectedFeedId: null, selectedFolderId: null, selectedTagId: null, selectedArticleId: null, focusedArticleIndex: 0, isSearching: false, searchQuery: '', showStarred: false }),
    }),
    {
      name: 'news-reader-ui',
      partialize: (state) => ({ theme: state.theme, viewMode: state.viewMode, sidebarOpen: state.sidebarOpen }),
    },
  ),
);
