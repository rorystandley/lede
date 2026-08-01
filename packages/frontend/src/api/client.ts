import { useAuthStore } from '../stores/auth.store.js';

const BASE_URL = '/api/v1';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const { accessToken } = useAuthStore.getState();

  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  };

  // Only set Content-Type when there's actually a body — Fastify rejects
  // empty bodies that announce themselves as application/json.
  if (opts.body !== undefined && opts.body !== null && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...opts, headers });

  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${useAuthStore.getState().accessToken}`;
      const retry = await fetch(`${BASE_URL}${path}`, { ...opts, headers });
      if (!retry.ok) {
        const retryText = await retry.text();
        let retryMsg = retryText;
        try { const j = JSON.parse(retryText); if (j.message) retryMsg = j.message; } catch { /* not JSON */ }
        throw new ApiError(retry.status, retryMsg);
      }
      if (retry.status === 204) return undefined as T;
      return retry.json();
    }
    useAuthStore.getState().logout();
    throw new ApiError(401, 'Session expired');
  }

  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const json = JSON.parse(text);
      if (json.message) message = json.message;
    } catch { /* response wasn't JSON, use raw text */ }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

async function tryRefresh(): Promise<boolean> {
  // The refresh token lives in an HttpOnly cookie, so we send no body — the
  // browser attaches the cookie automatically. Skip the round-trip entirely
  // when there's no session to refresh.
  if (!useAuthStore.getState().accessToken) return false;

  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return false;
    const data = await res.json();
    useAuthStore.getState().setAccessToken(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export { ApiError };
