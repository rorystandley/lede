import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomNav } from './BottomNav.js';

const uiMock = {
  showStarred: false,
  selectedFeedId: null as string | null,
  selectedFolderId: null as string | null,
  selectedTagId: null as string | null,
  isSearching: false,
  viewMode: 'list' as 'list' | 'card' | 'magazine',
  clearFilters: vi.fn(),
  setShowStarred: vi.fn(),
  setSidebarOpen: vi.fn(),
  setViewMode: vi.fn(),
};
const authMock = { user: { id: 'u1', email: 'user@example.com' } as { id: string; email: string } | null, logout: vi.fn() };

vi.mock('../../stores/index.js', () => ({
  useUiStore: () => uiMock,
  useAuthStore: () => authMock,
}));

function renderNav(overrides: Partial<Parameters<typeof BottomNav>[0]> = {}) {
  const handlers = {
    onOpenAddSources: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenStats: vi.fn(),
    onOpenDigest: vi.fn(),
    onOpenRules: vi.fn(),
    ...overrides,
  };
  render(<BottomNav {...handlers} />);
  return handlers;
}

describe('BottomNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uiMock.showStarred = false;
    uiMock.selectedFeedId = null;
    uiMock.selectedFolderId = null;
    uiMock.selectedTagId = null;
    uiMock.isSearching = false;
    uiMock.viewMode = 'list';
    authMock.user = { id: 'u1', email: 'user@example.com' };
  });

  it('renders the primary destinations', () => {
    renderNav();
    for (const label of ['Home', 'Feeds', 'Search', 'Saved', 'More']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('marks Home as current when no filter is active', () => {
    renderNav();
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Saved' })).not.toHaveAttribute('aria-current');
  });

  it('marks Saved as current when the starred view is active', () => {
    uiMock.showStarred = true;
    renderNav();
    expect(screen.getByRole('button', { name: 'Saved' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('wires Home, Feeds and Saved to the store actions', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(uiMock.clearFilters).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Feeds' }));
    expect(uiMock.setSidebarOpen).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'Saved' }));
    expect(uiMock.setShowStarred).toHaveBeenCalledWith(true);
  });

  it('opens the sidebar and focuses the search field when Search is tapped', async () => {
    const input = document.createElement('input');
    input.setAttribute('data-search-input', 'true');
    document.body.appendChild(input);

    renderNav();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(uiMock.setSidebarOpen).toHaveBeenCalledWith(true);
    await waitFor(() => expect(document.activeElement).toBe(input));

    input.remove();
  });

  it('opens the More sheet and routes items to their handlers, then closes', () => {
    const handlers = renderNav();

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('dialog', { name: 'More options' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reading Stats' }));
    expect(handlers.onOpenStats).toHaveBeenCalled();
    // Selecting an item dismisses the sheet.
    expect(screen.queryByRole('dialog', { name: 'More options' })).not.toBeInTheDocument();
  });

  it('switches the view mode from the More sheet', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'card' }));
    expect(uiMock.setViewMode).toHaveBeenCalledWith('card');
  });

  it('logs out from the More sheet', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(authMock.logout).toHaveBeenCalled();
  });

  it('hides logout in the More sheet when signed out', () => {
    authMock.user = null;
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
  });
});
