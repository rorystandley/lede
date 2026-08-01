import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordPage } from './ForgotPasswordPage.js';

const { forgotPasswordMock } = vi.hoisted(() => ({
  forgotPasswordMock: vi.fn(),
}));

vi.mock('../api/index.js', () => ({
  authApi: {
    forgotPassword: forgotPasswordMock,
  },
}));

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits the email and shows a confirmation message', async () => {
    forgotPasswordMock.mockResolvedValue({ message: 'ok' });
    const onBack = vi.fn();
    render(<ForgotPasswordPage onBack={onBack} />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    await waitFor(() => {
      expect(forgotPasswordMock).toHaveBeenCalledWith('user@example.com');
    });

    expect(screen.getByText(/you'll receive a password reset link/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Sign In' })).toBeInTheDocument();
  });

  it('shows an error when the API call fails', async () => {
    forgotPasswordMock.mockRejectedValue(new Error('Network error'));
    render(<ForgotPasswordPage onBack={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'bad@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });

  it('falls back to a generic error for non-Error failures', async () => {
    forgotPasswordMock.mockRejectedValue('unexpected');
    render(<ForgotPasswordPage onBack={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
  });

  it('navigates back when the back link is clicked', () => {
    const onBack = vi.fn();
    render(<ForgotPasswordPage onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: 'Back to Sign In' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
