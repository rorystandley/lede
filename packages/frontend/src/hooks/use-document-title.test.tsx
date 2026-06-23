import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUnreadTitle } from './use-document-title.js';

const { feedsApi } = vi.hoisted(() => ({
  feedsApi: { list: vi.fn() },
}));

vi.mock('../api/index.js', () => ({ feedsApi }));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const feed = (unreadCount: number) => ({ unreadCount });

describe('useUnreadTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.title = 'lede.';
  });

  afterEach(() => {
    document.title = 'lede.';
  });

  it('prefixes the title with the summed unread count', async () => {
    feedsApi.list.mockResolvedValue({ items: [feed(3), feed(9)] });

    renderHook(() => useUnreadTitle(), { wrapper: createWrapper() });

    await waitFor(() => expect(document.title).toBe('(12) lede.'));
  });

  it('falls back to the base title when nothing is unread', async () => {
    feedsApi.list.mockResolvedValue({ items: [feed(0), feed(0)] });

    renderHook(() => useUnreadTitle(), { wrapper: createWrapper() });

    await waitFor(() => expect(feedsApi.list).toHaveBeenCalled());
    expect(document.title).toBe('lede.');
  });

  it('restores the base title when unmounted', async () => {
    feedsApi.list.mockResolvedValue({ items: [feed(5)] });

    const { unmount } = renderHook(() => useUnreadTitle(), { wrapper: createWrapper() });
    await waitFor(() => expect(document.title).toBe('(5) lede.'));

    unmount();
    expect(document.title).toBe('lede.');
  });
});
