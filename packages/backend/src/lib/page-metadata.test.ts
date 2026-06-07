import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('page metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('extracts head metadata, resolves relative urls, and decodes entities', async () => {
    const readMock = vi.fn()
      .mockResolvedValueOnce({
        done: false,
        value: new TextEncoder().encode(`<!doctype html><html><head>
          <meta property="og:title" content="Story &amp; More">
          <meta content="Short &#39;desc&#39;" name="description">
          <meta name="og:image" content="/cover.jpg">
          <meta content="Example &amp; Co" property="og:site_name">
          <meta property="article:author" content="Reporter">
          <title>Ignored title</title>
        </head><body>Hello</body></html>`),
      })
      .mockResolvedValueOnce({ done: true, value: undefined });
    const cancelMock = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: vi.fn(() => ({
          read: readMock,
          cancel: cancelMock,
        })),
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchPageMetadata } = await import('./page-metadata.js');
    await expect(fetchPageMetadata('https://example.com/posts/1')).resolves.toEqual({
      title: 'Story & More',
      description: "Short 'desc'",
      image: 'https://example.com/cover.jpg',
      siteName: 'Example & Co',
      author: 'Reporter',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/posts/1',
      expect.objectContaining({
        headers: {
          'User-Agent': 'NewsReader/1.0 (Metadata Fetcher; +https://example.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
      }),
    );
    expect(cancelMock).toHaveBeenCalled();
  });

  it('falls back to the title tag and returns nulls for blank metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: vi.fn(() => ({
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('<html><head><title>Only Title</title><meta name="author" content="   "></head></html>'),
            })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn().mockResolvedValue(undefined),
        })),
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchPageMetadata } = await import('./page-metadata.js');
    await expect(fetchPageMetadata('https://example.com/post')).resolves.toEqual({
      title: 'Only Title',
      description: null,
      image: null,
      siteName: null,
      author: null,
    });
  });

  it('returns a null title when the title tag is present but blank', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: vi.fn(() => ({
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('<html><head><title></title></head></html>'),
            })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn().mockResolvedValue(undefined),
        })),
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchPageMetadata } = await import('./page-metadata.js');
    await expect(fetchPageMetadata('https://example.com/blank-title')).resolves.toEqual({
      title: null,
      description: null,
      image: null,
      siteName: null,
      author: null,
    });
  });

  it('falls back to scanning the first html chunk and drops malformed resolved image urls', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: vi.fn(() => ({
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(
                '<html><body><meta property="og:title" content="   "><meta property="og:description" content="Body description"><meta property="og:image" content="http://[invalid"></body></html>',
              ),
            })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn().mockResolvedValue(undefined),
        })),
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchPageMetadata } = await import('./page-metadata.js');
    await expect(fetchPageMetadata('https://example.com/post')).resolves.toEqual({
      title: null,
      description: 'Body description',
      image: null,
      siteName: null,
      author: null,
    });
  });

  it('returns null on request failures, bad responses, or missing bodies', async () => {
    const scenarios = [
      vi.fn().mockRejectedValue(new Error('network')),
      vi.fn().mockResolvedValue({ ok: false }),
      vi.fn().mockResolvedValue({ ok: true, body: null }),
    ];

    const { fetchPageMetadata } = await import('./page-metadata.js');

    for (const fetchMock of scenarios) {
      vi.stubGlobal('fetch', fetchMock);
      await expect(fetchPageMetadata('https://example.com/post')).resolves.toBeNull();
    }
  });
});
