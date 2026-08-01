import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  // Short-lived JWT held in memory / localStorage. The long-lived refresh
  // token is NOT stored here — it lives in an HttpOnly cookie the browser
  // manages and JavaScript cannot read, so an XSS can't exfiltrate it.
  accessToken: string | null;
  user: { id: string; email: string } | null;
  setAccessToken: (accessToken: string) => void;
  setUser: (user: { id: string; email: string }) => void;
  login: (user: { id: string; email: string }, accessToken: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user: null,
      setAccessToken: (accessToken) => set({ accessToken }),
      setUser: (user) => set({ user }),
      login: (user, accessToken) => set({ user, accessToken }),
      logout: () => set({ user: null, accessToken: null }),
      isAuthenticated: () => !!get().accessToken,
    }),
    { name: 'lede-auth' },
  ),
);
