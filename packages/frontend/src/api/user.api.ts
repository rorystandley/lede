import { api } from './client.js';

interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  timezone: string;
  digestSchedule: string;
  digestEnabled: boolean;
}

export const userApi = {
  getProfile: () => api.get<UserProfile>('/user/profile'),
  updateProfile: (data: Partial<{
    displayName: string;
    timezone: string;
    digestSchedule: string;
    digestEnabled: boolean;
  }>) => api.patch('/user/profile', data),
};
