import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header.js';

const toggleThemeMock = vi.fn();
const toggleSidebarMock = vi.fn();
const setViewModeMock = vi.fn();
const logoutMock = vi.fn();
const apiLogoutMock = vi.fn();
const useUiStoreMock = vi.fn();
const useAuthStoreMock = vi.fn();

vi.mock('../../stores/index.js', () => ({
  useUiStore: () => useUiStoreMock(),
  useAuthStore: () => useAuthStoreMock(),
}));

vi.mock('../../api/index.js', () => ({
  authApi: {
    logout: () => apiLogoutMock(),
  },
}));

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiLogoutMock.mockResolvedValue(undefined);
    useUiStoreMock.mockReturnValue({
      theme: 'light',
      toggleTheme: toggleThemeMock,
      toggleSidebar: toggleSidebarMock,
      viewMode: 'list',
      setViewMode: setViewModeMock,
    });
    useAuthStoreMock.mockReturnValue({
      user: { id: 'user-1', email: 'user@example.com' },
      logout: logoutMock,
    });
  });

  it('renders controls and fires handlers', () => {
    const onOpenSettings = vi.fn();
    const onOpenRules = vi.fn();
    const onOpenDigest = vi.fn();
    const onOpenStats = vi.fn();
    const onOpenKeyboardShortcuts = vi.fn();

    render(
      <Header
        onOpenSettings={onOpenSettings}
        onOpenRules={onOpenRules}
        onOpenDigest={onOpenDigest}
        onOpenStats={onOpenStats}
        onOpenKeyboardShortcuts={onOpenKeyboardShortcuts}
      />,
    );

    fireEvent.click(screen.getByLabelText('Toggle sidebar'));
    fireEvent.click(screen.getByRole('button', { name: 'card' }));
    fireEvent.click(screen.getByLabelText('Toggle theme'));
    fireEvent.click(screen.getByLabelText('Reading Stats'));
    fireEvent.click(screen.getByLabelText('Morning Briefing'));
    fireEvent.click(screen.getByLabelText('Rules'));
    fireEvent.click(screen.getByLabelText('Settings'));
    fireEvent.click(screen.getByLabelText('Keyboard shortcuts'));
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

    expect(toggleSidebarMock).toHaveBeenCalled();
    expect(setViewModeMock).toHaveBeenCalledWith('card');
    expect(toggleThemeMock).toHaveBeenCalled();
    expect(onOpenStats).toHaveBeenCalled();
    expect(onOpenDigest).toHaveBeenCalled();
    expect(onOpenRules).toHaveBeenCalled();
    expect(onOpenSettings).toHaveBeenCalled();
    expect(onOpenKeyboardShortcuts).toHaveBeenCalled();
    expect(apiLogoutMock).toHaveBeenCalled();
    expect(logoutMock).toHaveBeenCalled();
  });

  it('renders the dark theme icon state and omits logout without a user', () => {
    useUiStoreMock.mockReturnValue({
      theme: 'dark',
      toggleTheme: toggleThemeMock,
      toggleSidebar: toggleSidebarMock,
      viewMode: 'magazine',
      setViewMode: setViewModeMock,
    });
    useAuthStoreMock.mockReturnValue({
      user: null,
      logout: logoutMock,
    });

    const { container } = render(<Header />);

    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
    expect(container.querySelector('circle[cx="12"][cy="12"][r="5"]')).toBeInTheDocument();
    expect(screen.getByText('magazine').closest('button')!.className).toContain('bg-surface');
  });
});
