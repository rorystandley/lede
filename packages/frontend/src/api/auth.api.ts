import { api } from './client.js';
import type { AuthTokens, AuthUser } from '@lede/shared';

interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export const authApi = {
  register: (email: string, password: string, displayName?: string) =>
    api.post<AuthResponse>('/auth/register', { email, password, displayName }),

  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),

  forgotPassword: (email: string) =>
    api.post<{ message: string }>('/auth/forgot-password', { email }),

  resetPassword: (token: string, password: string) =>
    api.post<{ message: string }>('/auth/reset-password', { token, password }),
};
