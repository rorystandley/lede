import type { AIProvider } from '../constants.js';

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  timezone: string;
  aiProvider: AIProvider | null;
  digestSchedule: string;
  digestEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  lastUsed: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
}
