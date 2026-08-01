import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ViewMode } from '@lede/shared';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  /** Optional inline action, e.g. "Undo" after a swipe-to-archive. */
  action?: ToastAction;
}

interface UiState {
  theme: 'light' | 'dark';
  viewMode: ViewMode;
  sidebarOpen: boolean;
  selectedFeedId: string | null;
  selectedFolderId: string | null;
  selectedTagId: string | null;
  selectedArticleId: string | null;
  /** Ordered ids of the currently rendered article list — drives reader swipe prev/next. */
  articleOrder: string[];
  focusedArticleIndex: number;
  searchQuery: string;
  isSearching: boolean;
  showStarred: boolean;
  readFilter: 'unread' | 'all';
  toasts: Toast[];
  toggleTheme: () => void;
  setViewMode: (mode: ViewMode) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  selectFeed: (feedId: string | null) => void;
  selectFolder: (folderId: string | null) => void;
  selectTag: (tagId: string | null) => void;
  selectArticle: (articleId: string | null) => void;
  setArticleOrder: (ids: string[]) => void;
  setFocusedArticleIndex: (index: number) => void;
  setSearchQuery: (query: string) => void;
  setIsSearching: (searching: boolean) => void;
  setShowStarred: (starred: boolean) => void;
  setReadFilter: (filter: 'unread' | 'all') => void;
  clearFilters: () => void;
  addToast: (message: string, type?: Toast['type'], action?: ToastAction) => void;
  dismissToast: (id: string) => void;
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
      articleOrder: [],
      focusedArticleIndex: 0,
      searchQuery: '',
      isSearching: false,
      showStarred: false,
      readFilter: 'unread',
      toasts: [],
      addToast: (message, type = 'info', action) => {
        const id = crypto.randomUUID();
        set((s) => ({ toasts: [...s.toasts, { id, message, type, action }] }));
        setTimeout(() => get().dismissToast(id), 4000);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      toggleTheme: () => {
        const next = get().theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        set({ theme: next });
      },
      setViewMode: (viewMode) => set({ viewMode }),
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      selectFeed: (feedId) => set({ selectedFeedId: feedId, selectedFolderId: null, selectedTagId: null, selectedArticleId: null, focusedArticleIndex: 0, isSearching: false, showStarred: false, readFilter: 'unread' }),
      selectFolder: (folderId) => set({ selectedFolderId: folderId, selectedFeedId: null, selectedTagId: null, selectedArticleId: null, focusedArticleIndex: 0, isSearching: false, showStarred: false, readFilter: 'unread' }),
      selectTag: (tagId) => set({ selectedTagId: tagId, selectedFeedId: null, selectedFolderId: null, selectedArticleId: null, focusedArticleIndex: 0, isSearching: false, showStarred: false, readFilter: 'unread' }),
      selectArticle: (articleId) => set({ selectedArticleId: articleId }),
      setArticleOrder: (ids) => set({ articleOrder: ids }),
      setFocusedArticleIndex: (index) => set({ focusedArticleIndex: index }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setIsSearching: (isSearching) => set({ isSearching, selectedFeedId: null, selectedFolderId: null, selectedTagId: null, selectedArticleId: null, focusedArticleIndex: 0, showStarred: false, readFilter: 'unread' }),
      setShowStarred: (showStarred) => set({ showStarred, selectedFeedId: null, selectedFolderId: null, selectedTagId: null, selectedArticleId: null, focusedArticleIndex: 0, isSearching: false, readFilter: 'unread' }),
      setReadFilter: (readFilter) => set({ readFilter }),
      clearFilters: () => set({ selectedFeedId: null, selectedFolderId: null, selectedTagId: null, selectedArticleId: null, focusedArticleIndex: 0, isSearching: false, searchQuery: '', showStarred: false, readFilter: 'unread' }),
    }),
    {
      name: 'lede-ui',
      partialize: (state) => ({ theme: state.theme, viewMode: state.viewMode, sidebarOpen: state.sidebarOpen }),
    },
  ),
);
