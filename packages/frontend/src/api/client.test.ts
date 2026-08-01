import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = {
  accessToken: 'access-token' as string | null,
  setAccessToken: vi.fn(),
  logout: vi.fn(),
};

vi.mock('../stores/auth.store.js', () => ({
  useAuthStore: {
    getState: () => authState,
  },
}));

describe('api client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    authState.accessToken = 'access-token';
    vi.stubGlobal('fetch', vi.fn());
  });

  it('adds auth and json headers for requests with a body', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ ok: true }),
    } as unknown as Response);

    const { api } = await import('./client.js');
    const result = await api.post('/feeds', { url: 'https://example.com/rss' });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/feeds', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/rss' }),
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
    });
  });

  it('omits content type when no body is sent and returns undefined for 204 responses', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
    } as Response);

    const { api } = await import('./client.js');
    const result = await api.post('/feeds');

    expect(result).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/feeds', {
      method: 'POST',
      body: undefined,
      headers: {
        Authorization: 'Bearer access-token',
      },
    });
  });

  it('supports put and patch helpers', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ ok: 'put' }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ ok: 'patch' }),
      } as unknown as Response);

    const { api } = await import('./client.js');

    await expect(api.put('/feeds/feed-1', { title: 'Renamed' })).resolves.toEqual({ ok: 'put' });
    await expect(api.patch('/feeds/feed-1', { title: 'Patched' })).resolves.toEqual({ ok: 'patch' });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/feeds/feed-1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Renamed' }),
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/feeds/feed-1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Patched' }),
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
    });
  });

  it('supports put and patch helpers without a request body', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

    const { api } = await import('./client.js');

    await expect(api.put('/feeds/feed-1')).resolves.toBeUndefined();
    await expect(api.patch('/feeds/feed-1')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/feeds/feed-1', {
      method: 'PUT',
      body: undefined,
      headers: {
        Authorization: 'Bearer access-token',
      },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/feeds/feed-1', {
      method: 'PATCH',
      body: undefined,
      headers: {
        Authorization: 'Bearer access-token',
      },
    });
  });

  it('supports the delete helper', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
    } as Response);

    const { api } = await import('./client.js');
    await expect(api.delete('/feeds/feed-1')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/feeds/feed-1', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer access-token',
      },
    });
  });

  it('throws parsed API errors when the response body is json', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue(JSON.stringify({ message: 'Something broke' })),
    } as unknown as Response);

    const { api, ApiError } = await import('./client.js');

    await expect(api.get('/stats')).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: 'Something broke',
    } satisfies Partial<InstanceType<typeof ApiError>>);
  });

  it('falls back to raw text errors for non-json responses', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      text: vi.fn().mockResolvedValue('Upstream exploded'),
    } as unknown as Response);

    const { api } = await import('./client.js');

    await expect(api.get('/stats')).rejects.toMatchObject({
      status: 502,
      message: 'Upstream exploded',
    });
  });

  it('refreshes expired sessions via the cookie, retries the request, and returns the retry payload', async () => {
    const fetchMock = vi.mocked(fetch);
    authState.accessToken = 'old-access-token';
    authState.setAccessToken.mockImplementation((accessToken: string) => {
      authState.accessToken = accessToken;
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          accessToken: 'new-access-token',
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ articles: [] }),
      } as unknown as Response);

    const { api } = await import('./client.js');
    const result = await api.get('/articles');

    expect(result).toEqual({ articles: [] });
    expect(authState.setAccessToken).toHaveBeenCalledWith('new-access-token');
    // Refresh sends no body and no token — the HttpOnly cookie carries it.
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
    const refreshInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(refreshInit.body).toBeUndefined();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/v1/articles',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer new-access-token',
        },
      }),
    );
  });

  it('throws the retry error after a successful refresh when the second attempt still fails', async () => {
    const fetchMock = vi.mocked(fetch);
    authState.setAccessToken.mockImplementation((accessToken: string) => {
      authState.accessToken = accessToken;
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          accessToken: 'fresh-access-token',
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: vi.fn().mockResolvedValue(JSON.stringify({ message: 'Still forbidden' })),
      } as unknown as Response);

    const { api } = await import('./client.js');

    await expect(api.get('/articles')).rejects.toMatchObject({
      status: 403,
      message: 'Still forbidden',
    });
  });

  it('falls back to raw retry text errors and handles retry 204 responses', async () => {
    const fetchMock = vi.mocked(fetch);
    authState.setAccessToken.mockImplementation((accessToken: string) => {
      authState.accessToken = accessToken;
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          accessToken: 'fresh-access-token',
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: vi.fn().mockResolvedValue('Retry failed upstream'),
      } as unknown as Response);

    const { api } = await import('./client.js');

    await expect(api.get('/articles')).rejects.toMatchObject({
      status: 502,
      message: 'Retry failed upstream',
    });

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          accessToken: 'fresher-access-token',
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

    await expect(api.get('/articles')).resolves.toBeUndefined();
  });

  it('logs out and throws a session-expired error when refresh fails', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

    const { api } = await import('./client.js');

    await expect(api.get('/articles')).rejects.toMatchObject({
      status: 401,
      message: 'Session expired',
    });
    expect(authState.logout).toHaveBeenCalled();
  });

  it('does not attempt refresh when there is no access token or the refresh request throws', async () => {
    const fetchMock = vi.mocked(fetch);
    authState.accessToken = null;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    const { api } = await import('./client.js');

    await expect(api.get('/articles')).rejects.toMatchObject({
      status: 401,
      message: 'Session expired',
    });
    // No refresh attempt made — only the original request.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    authState.accessToken = 'access-token';
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response)
      .mockRejectedValueOnce(new Error('network down'));

    await expect(api.get('/articles')).rejects.toMatchObject({
      status: 401,
      message: 'Session expired',
    });
    expect(authState.logout).toHaveBeenCalledTimes(2);
  });
});
