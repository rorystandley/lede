import { useState } from 'react';
import { authApi } from '../api/index.js';
import { useAuthStore } from '../stores/index.js';

interface LoginPageProps {
  onForgotPassword: () => void;
}

export function LoginPage({ onForgotPassword }: LoginPageProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = isRegister
        ? await authApi.register(email, password, displayName || undefined)
        : await authApi.login(email, password);
      login(res.user, res.accessToken);
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

        <form onSubmit={handleSubmit} className="bg-surface-secondary border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">
            {isRegister ? 'Create Account' : 'Sign In'}
          </h2>

          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="Optional"
              />
            </div>
          )}

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

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder={isRegister ? 'At least 8 characters' : ''}
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 text-sm font-medium bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>

          {!isRegister && (
            <p className="text-xs text-text-secondary text-center">
              <button
                type="button"
                onClick={onForgotPassword}
                className="text-primary-600 hover:underline"
              >
                Forgot your password?
              </button>
            </p>
          )}

          <p className="text-xs text-text-secondary text-center">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => { setIsRegister(!isRegister); setError(''); }}
              className="text-primary-600 hover:underline"
            >
              {isRegister ? 'Sign in' : 'Register'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
