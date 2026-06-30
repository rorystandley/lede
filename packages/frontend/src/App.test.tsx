import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';

const authState = {
  isAuthenticated: vi.fn(),
};

const uiState: Record<string, unknown> = {
  theme: 'light',
  selectArticle: vi.fn(),
  setSidebarOpen: vi.fn(),
  toasts: [],
  dismissToast: vi.fn(),
};

vi.mock('./stores/index.js', () => ({
  useAuthStore: () => authState,
  useUiStore: (selector?: (s: Record<string, unknown>) => unknown) =>
    selector ? selector(uiState) : uiState,
}));

vi.mock('./components/layout/Header.js', () => ({
  Header: ({ onOpenSettings, onOpenRules, onOpenDigest, onOpenStats, onOpenKeyboardShortcuts }: Record<string, () => void>) => (
    <div>
      <button onClick={onOpenSettings}>settings</button>
      <button onClick={onOpenRules}>rules</button>
      <button onClick={onOpenDigest}>digest</button>
      <button onClick={onOpenStats}>stats</button>
      <button onClick={onOpenKeyboardShortcuts}>shortcuts</button>
    </div>
  ),
}));

vi.mock('./pages/FeedPage.js', () => ({
  FeedPage: ({ onOpenAddSources }: Record<string, () => void>) => (
    <button onClick={onOpenAddSources}>feed-page</button>
  ),
}));

vi.mock('./pages/LoginPage.js', () => ({
  LoginPage: () => <div>login-page</div>,
}));

vi.mock('./pages/ForgotPasswordPage.js', () => ({
  ForgotPasswordPage: () => <div>forgot-password-page</div>,
}));

vi.mock('./pages/ResetPasswordPage.js', () => ({
  ResetPasswordPage: () => <div>reset-password-page</div>,
}));

vi.mock('./pages/SettingsPage.js', () => ({
  SettingsPage: ({ onClose }: Record<string, () => void>) => <button onClick={onClose}>settings-page</button>,
}));

vi.mock('./pages/RulesPage.js', () => ({
  RulesPage: ({ onClose }: Record<string, () => void>) => <button onClick={onClose}>rules-page</button>,
}));

vi.mock('./pages/DigestPage.js', () => ({
  DigestPage: ({ onClose, onOpenArticle }: { onClose: () => void; onOpenArticle: (id: string) => void }) => (
    <div>
      <button onClick={() => onOpenArticle('article-1')}>open-article</button>
      <button onClick={onClose}>digest-page</button>
    </div>
  ),
}));

vi.mock('./pages/StatsPage.js', () => ({
  StatsPage: ({ onClose }: Record<string, () => void>) => <button onClick={onClose}>stats-page</button>,
}));

vi.mock('./pages/AddSourcesPage.js', () => ({
  AddSourcesPage: ({ onClose }: Record<string, () => void>) => <button onClick={onClose}>add-sources-page</button>,
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAuthenticated.mockReturnValue(true);
    uiState.theme = 'light';
  });

  it('renders the login page when unauthenticated', () => {
    authState.isAuthenticated.mockReturnValue(false);

    render(<App />);

    expect(screen.getByText('login-page')).toBeInTheDocument();
  });

  it('renders the main app shell and updates the theme attribute', () => {
    uiState.theme = 'dark';

    render(<App />);

    expect(screen.getByText('feed-page')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('opens and closes overlay pages and wires digest article selection', () => {
    render(<App />);

    fireEvent.click(screen.getByText('settings'));
    fireEvent.click(screen.getByText('rules'));
    fireEvent.click(screen.getByText('digest'));
    fireEvent.click(screen.getByText('stats'));
    fireEvent.click(screen.getByText('feed-page'));

    expect(screen.getByText('settings-page')).toBeInTheDocument();
    expect(screen.getByText('rules-page')).toBeInTheDocument();
    expect(screen.getByText('stats-page')).toBeInTheDocument();
    expect(screen.getByText('add-sources-page')).toBeInTheDocument();

    fireEvent.click(screen.getByText('open-article'));
    expect(uiState.selectArticle).toHaveBeenCalledWith('article-1');

    fireEvent.click(screen.getByText('settings-page'));
    fireEvent.click(screen.getByText('rules-page'));
    fireEvent.click(screen.getByText('digest-page'));
    fireEvent.click(screen.getByText('stats-page'));
    fireEvent.click(screen.getByText('add-sources-page'));

    expect(screen.queryByText('settings-page')).not.toBeInTheDocument();
    expect(screen.queryByText('rules-page')).not.toBeInTheDocument();
    expect(screen.queryByText('stats-page')).not.toBeInTheDocument();
    expect(screen.queryByText('add-sources-page')).not.toBeInTheDocument();
  });

  it('opens shortcut help from the header or ? key and closes it with Escape', () => {
    render(<App />);

    fireEvent.click(screen.getByText('shortcuts'));
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: '?', shiftKey: true });
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });
});
