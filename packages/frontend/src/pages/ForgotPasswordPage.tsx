import { useState } from 'react';
import { authApi } from '../api/index.js';

interface ForgotPasswordPageProps {
  onBack: () => void;
}

export function ForgotPasswordPage({ onBack }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <img src="/icon.svg" alt="lede" width={56} height={56} className="rounded-2xl shadow-sm mb-3" />
          <h1 className="text-3xl font-bold tracking-tight text-text-primary lowercase">
            lede<span style={{ color: '#12B981' }}>.</span>
          </h1>
          <p className="text-sm text-text-secondary mt-1">Sift the noise, keep the story</p>
        </div>

        <div className="bg-surface-secondary border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Reset Password</h2>

          {submitted ? (
            <>
              <p className="text-sm text-text-secondary">
                If an account exists with that email, you'll receive a password reset link shortly.
              </p>
              <button
                type="button"
                onClick={onBack}
                className="w-full py-2 text-sm font-medium bg-primary-600 text-white rounded hover:bg-primary-700"
              >
                Back to Sign In
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-text-secondary">
                Enter your email address and we'll send you a link to reset your password.
              </p>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm bg-surface border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="you@example.com"
                />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 text-sm font-medium bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <p className="text-xs text-text-secondary text-center">
                <button
                  type="button"
                  onClick={onBack}
                  className="text-primary-600 hover:underline"
                >
                  Back to Sign In
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
