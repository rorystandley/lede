import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResetPasswordPage } from './ResetPasswordPage.js';

const { resetPasswordMock } = vi.hoisted(() => ({
  resetPasswordMock: vi.fn(),
}));

vi.mock('../api/index.js', () => ({
  authApi: {
    resetPassword: resetPasswordMock,
  },
}));

function getPasswordInputs() {
  return document.querySelectorAll('input[type="password"]') as NodeListOf<HTMLInputElement>;
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resets the password and shows a success message', async () => {
    resetPasswordMock.mockResolvedValue({ message: 'ok' });
    const onBack = vi.fn();
    render(<ResetPasswordPage token="valid-token" onBack={onBack} />);

    const [passwordInput, confirmInput] = getPasswordInputs();
    fireEvent.change(passwordInput, { target: { value: 'newpassword123' } });
    fireEvent.change(confirmInput, { target: { value: 'newpassword123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() => {
      expect(resetPasswordMock).toHaveBeenCalledWith('valid-token', 'newpassword123');
    });

    expect(screen.getByText(/password has been reset successfully/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Sign In' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('shows an error when passwords do not match', async () => {
    render(<ResetPasswordPage token="valid-token" onBack={vi.fn()} />);

    const [passwordInput, confirmInput] = getPasswordInputs();
    fireEvent.change(passwordInput, { target: { value: 'newpassword123' } });
    fireEvent.change(confirmInput, { target: { value: 'different456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });

  it('shows an error when the API call fails', async () => {
    resetPasswordMock.mockRejectedValue(new Error('Invalid or expired reset token'));
    render(<ResetPasswordPage token="expired-token" onBack={vi.fn()} />);

    const [passwordInput, confirmInput] = getPasswordInputs();
    fireEvent.change(passwordInput, { target: { value: 'newpassword123' } });
    fireEvent.change(confirmInput, { target: { value: 'newpassword123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(await screen.findByText('Invalid or expired reset token')).toBeInTheDocument();
  });

  it('falls back to a generic error for non-Error failures', async () => {
    resetPasswordMock.mockRejectedValue('unexpected');
    render(<ResetPasswordPage token="some-token" onBack={vi.fn()} />);

    const [passwordInput, confirmInput] = getPasswordInputs();
    fireEvent.change(passwordInput, { target: { value: 'newpassword123' } });
    fireEvent.change(confirmInput, { target: { value: 'newpassword123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
  });

  it('navigates back when the back link is clicked', () => {
    const onBack = vi.fn();
    render(<ResetPasswordPage token="valid-token" onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: 'Back to Sign In' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
