import { api } from './client.js';
import type { AuthUser } from '@lede/shared';

// The refresh token is delivered as an HttpOnly cookie, so it never appears in
// the JSON response the SPA can read — only the short-lived access token does.
interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

export const authApi = {
  register: (email: string, password: string, displayName?: string) =>
    api.post<AuthResponse>('/auth/register', { email, password, displayName }),

  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),

  logout: () => api.post<void>('/auth/logout'),

  forgotPassword: (email: string) =>
    api.post<{ message: string }>('/auth/forgot-password', { email }),

  resetPassword: (token: string, password: string) =>
    api.post<{ message: string }>('/auth/reset-password', { token, password }),
};
