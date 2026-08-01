import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from './auth.store.js';
import { useUiStore } from './ui.store.js';
import * as storesIndex from './index.js';

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      accessToken: null,
      user: null,
    });
  });

  it('supports login, access-token updates, user updates, logout, and auth checks', () => {
    useAuthStore.getState().login({ id: 'user-1', email: 'user@example.com' }, 'access-1');
    expect(useAuthStore.getState().user).toEqual({ id: 'user-1', email: 'user@example.com' });
    expect(useAuthStore.getState().accessToken).toBe('access-1');
    expect(useAuthStore.getState().isAuthenticated()).toBe(true);

    useAuthStore.getState().setAccessToken('access-2');
    useAuthStore.getState().setUser({ id: 'user-2', email: 'second@example.com' });

    expect(useAuthStore.getState().accessToken).toBe('access-2');
    expect(useAuthStore.getState().user).toEqual({ id: 'user-2', email: 'second@example.com' });

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });
});

describe('ui store', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    useUiStore.setState({
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
    });
  });

  it('updates theme, layout, and focused article state', () => {
    useUiStore.getState().toggleTheme();
    expect(useUiStore.getState().theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    useUiStore.getState().toggleTheme();
    expect(useUiStore.getState().theme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    useUiStore.getState().setViewMode('magazine');
    useUiStore.getState().toggleSidebar();
    useUiStore.getState().setSidebarOpen(true);
    useUiStore.getState().selectArticle('article-1');
    useUiStore.getState().setFocusedArticleIndex(4);
    useUiStore.getState().setSearchQuery('react');

    expect(useUiStore.getState().viewMode).toBe('magazine');
    expect(useUiStore.getState().sidebarOpen).toBe(true);
    expect(useUiStore.getState().selectedArticleId).toBe('article-1');
    expect(useUiStore.getState().focusedArticleIndex).toBe(4);
    expect(useUiStore.getState().searchQuery).toBe('react');
  });

  it('resets competing filters when switching feed, folder, tag, search, or starred mode', () => {
    useUiStore.setState({
      selectedFeedId: 'feed-0',
      selectedFolderId: 'folder-0',
      selectedTagId: 'tag-0',
      selectedArticleId: 'article-0',
      focusedArticleIndex: 9,
      isSearching: true,
      showStarred: true,
      searchQuery: 'before',
    });

    useUiStore.getState().selectFeed('feed-1');
    expect(useUiStore.getState()).toMatchObject({
      selectedFeedId: 'feed-1',
      selectedFolderId: null,
      selectedTagId: null,
      selectedArticleId: null,
      focusedArticleIndex: 0,
      isSearching: false,
      showStarred: false,
    });

    useUiStore.getState().selectFolder('folder-1');
    expect(useUiStore.getState()).toMatchObject({
      selectedFeedId: null,
      selectedFolderId: 'folder-1',
      selectedTagId: null,
    });

    useUiStore.getState().selectTag('tag-1');
    expect(useUiStore.getState()).toMatchObject({
      selectedFeedId: null,
      selectedFolderId: null,
      selectedTagId: 'tag-1',
    });

    useUiStore.getState().setIsSearching(true);
    expect(useUiStore.getState()).toMatchObject({
      isSearching: true,
      selectedFeedId: null,
      selectedFolderId: null,
      selectedTagId: null,
      selectedArticleId: null,
      focusedArticleIndex: 0,
      showStarred: false,
    });

    useUiStore.getState().setShowStarred(true);
    expect(useUiStore.getState()).toMatchObject({
      showStarred: true,
      selectedFeedId: null,
      selectedFolderId: null,
      selectedTagId: null,
      selectedArticleId: null,
      focusedArticleIndex: 0,
      isSearching: false,
    });

    useUiStore.getState().clearFilters();
    expect(useUiStore.getState()).toMatchObject({
      selectedFeedId: null,
      selectedFolderId: null,
      selectedTagId: null,
      selectedArticleId: null,
      focusedArticleIndex: 0,
      isSearching: false,
      searchQuery: '',
      showStarred: false,
    });
  });

  it('sets the read filter and resets it to unread when navigating', () => {
    useUiStore.getState().setReadFilter('all');
    expect(useUiStore.getState().readFilter).toBe('all');

    useUiStore.getState().selectFeed('feed-1');
    expect(useUiStore.getState().readFilter).toBe('unread');

    useUiStore.getState().setReadFilter('all');
    useUiStore.getState().setShowStarred(true);
    expect(useUiStore.getState().readFilter).toBe('unread');

    useUiStore.getState().setReadFilter('all');
    useUiStore.getState().clearFilters();
    expect(useUiStore.getState().readFilter).toBe('unread');
  });

  it('re-exports the stores from the barrel file', () => {
    expect(storesIndex.useAuthStore).toBe(useAuthStore);
    expect(storesIndex.useUiStore).toBe(useUiStore);
  });
});
