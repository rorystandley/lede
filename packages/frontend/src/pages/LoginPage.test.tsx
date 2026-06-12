import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage.js';

const { loginMock, registerMock, storeLoginMock } = vi.hoisted(() => ({
  loginMock: vi.fn(),
  registerMock: vi.fn(),
  storeLoginMock: vi.fn(),
}));

vi.mock('../api/index.js', () => ({
  authApi: {
    login: loginMock,
    register: registerMock,
  },
}));

vi.mock('../stores/index.js', () => ({
  useAuthStore: () => ({
    login: storeLoginMock,
  }),
}));

function getPasswordInput() {
  return document.querySelector('input[type="password"]') as HTMLInputElement;
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs in an existing user', async () => {
    loginMock.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com' },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    render(<LoginPage onForgotPassword={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(getPasswordInput(), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith('user@example.com', 'password123');
    });
    expect(storeLoginMock).toHaveBeenCalledWith(
      { id: 'user-1', email: 'user@example.com' },
      'access-token',
      'refresh-token',
    );
  });

  it('supports account creation and passes an optional display name', async () => {
    registerMock.mockResolvedValue({
      user: { id: 'user-2', email: 'new@example.com' },
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });

    render(<LoginPage onForgotPassword={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Optional'), {
      target: { value: 'New User' },
    });
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith('new@example.com', 'password123', 'New User');
    });
    expect(storeLoginMock).toHaveBeenCalledWith(
      { id: 'user-2', email: 'new@example.com' },
      'new-access',
      'new-refresh',
    );
  });

  it('omits the display name when registering without one', async () => {
    registerMock.mockResolvedValue({
      user: { id: 'user-3', email: 'blank@example.com' },
      accessToken: 'blank-access',
      refreshToken: 'blank-refresh',
    });

    render(<LoginPage onForgotPassword={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'blank@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith('blank@example.com', 'password123', undefined);
    });
  });

  it('shows API errors and clears them when toggling modes', async () => {
    loginMock.mockRejectedValue(new Error('Bad credentials'));

    render(<LoginPage onForgotPassword={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'bad@example.com' },
    });
    fireEvent.change(getPasswordInput(), {
      target: { value: 'wrongpass' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText('Bad credentials')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(screen.queryByText('Bad credentials')).not.toBeInTheDocument();
  });

  it('calls onForgotPassword when the forgot password link is clicked', () => {
    const onForgotPassword = vi.fn();
    render(<LoginPage onForgotPassword={onForgotPassword} />);

    fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }));
    expect(onForgotPassword).toHaveBeenCalledOnce();
  });

  it('hides the forgot password link in register mode', () => {
    render(<LoginPage onForgotPassword={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Forgot your password?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(screen.queryByRole('button', { name: 'Forgot your password?' })).not.toBeInTheDocument();
  });

  it('falls back to a generic error for non-Error failures', async () => {
    loginMock.mockRejectedValue('wat');

    render(<LoginPage onForgotPassword={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(getPasswordInput(), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
  });
});
