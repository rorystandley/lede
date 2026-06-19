import { beforeEach, describe, expect, it, vi } from 'vitest';

const { parseFeedMock, fetchMock, timeoutMock } = vi.hoisted(() => ({
  parseFeedMock: vi.fn(),
  fetchMock: vi.fn(),
  timeoutMock: vi.fn(() => 'timeout-signal'),
}));

vi.mock('./feed-parser.js', () => ({
  parseFeed: parseFeedMock,
}));

import { normalizeInputUrl, extractFeedLinks, discoverFeeds } from './feed-discovery.js';

function feed(overrides: Record<string, unknown> = {}) {
  return {
    title: 'A Feed',
    description: 'Desc',
    siteUrl: 'https://example.com',
    feedType: 'rss',
    items: [{}, {}],
    ...overrides,
  };
}

describe('normalizeInputUrl', () => {
  it('adds https:// to bare hosts', () => {
    expect(normalizeInputUrl('theregister.com')).toBe('https://theregister.com');
    expect(normalizeInputUrl('  example.com/blog  ')).toBe('https://example.com/blog');
    expect(normalizeInputUrl('//example.com')).toBe('https://example.com');
  });

  it('leaves existing schemes untouched', () => {
    expect(normalizeInputUrl('http://example.com/feed')).toBe('http://example.com/feed');
    expect(normalizeInputUrl('https://example.com/feed.xml')).toBe('https://example.com/feed.xml');
  });
});

describe('extractFeedLinks', () => {
  it('extracts rss, atom, and json feed links and resolves relative hrefs', () => {
    const html = `
      <head>
        <link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml">
        <link rel="alternate" type="application/atom+xml" href="https://example.com/atom">
        <link rel="alternate" type="application/feed+json" href="feed.json">
        <link rel="stylesheet" type="text/css" href="/styles.css">
        <link rel="alternate" type="application/xhtml+xml" href="/mobile">
        <link rel="alternate" hreflang="fr" type="text/html" href="/fr">
      </head>`;

    expect(extractFeedLinks(html, 'https://example.com/blog/')).toEqual([
      { url: 'https://example.com/rss.xml', title: 'RSS' },
      { url: 'https://example.com/atom', title: null },
      { url: 'https://example.com/blog/feed.json', title: null },
    ]);
  });

  it('dedupes repeated hrefs', () => {
    const html = `
      <link rel="alternate" type="application/rss+xml" href="/feed">
      <link rel="alternate" type="application/rss+xml" href="/feed">`;
    expect(extractFeedLinks(html, 'https://example.com')).toEqual([
      { url: 'https://example.com/feed', title: null },
    ]);
  });
});

describe('discoverFeeds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('AbortSignal', { timeout: timeoutMock });
  });

  it('returns the feed directly when the input is itself a feed', async () => {
    parseFeedMock.mockResolvedValueOnce(feed({ title: 'Direct Feed' }));

    const result = await discoverFeeds('https://example.com/feed.xml');

    expect(result).toEqual([
      {
        url: 'https://example.com/feed.xml',
        title: 'Direct Feed',
        description: 'Desc',
        siteUrl: 'https://example.com',
        feedType: 'rss',
        itemCount: 2,
      },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('discovers feeds advertised in the page HTML', async () => {
    // Direct parse fails (it's an HTML homepage), then we fetch the page.
    parseFeedMock.mockRejectedValueOnce(new Error('not a feed'));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      url: 'https://www.theregister.com/',
      text: vi.fn().mockResolvedValue(
        '<link rel="alternate" type="application/atom+xml" title="Headlines" href="/headlines.atom">',
      ),
    });
    parseFeedMock.mockResolvedValueOnce(feed({ title: 'The Register' }));

    const result = await discoverFeeds('theregister.com');

    expect(parseFeedMock).toHaveBeenNthCalledWith(1, 'https://theregister.com');
    expect(parseFeedMock).toHaveBeenNthCalledWith(2, 'https://www.theregister.com/headlines.atom');
    expect(result).toEqual([
      {
        url: 'https://www.theregister.com/headlines.atom',
        title: 'The Register',
        description: 'Desc',
        siteUrl: 'https://example.com',
        feedType: 'rss',
        itemCount: 2,
      },
    ]);
  });

  it('probes common feed paths when nothing is advertised', async () => {
    parseFeedMock.mockRejectedValueOnce(new Error('not a feed')); // direct attempt
    fetchMock.mockResolvedValueOnce({
      ok: true,
      url: 'https://example.com/',
      text: vi.fn().mockResolvedValue('<html><body>No feeds here</body></html>'),
    });
    // Only /feed.xml resolves to a real feed; everything else throws.
    parseFeedMock.mockImplementation(async (u: string) => {
      if (u === 'https://example.com/feed.xml') return feed({ title: 'Probed Feed' });
      throw new Error('404');
    });

    const result = await discoverFeeds('example.com');

    expect(result).toEqual([
      {
        url: 'https://example.com/feed.xml',
        title: 'Probed Feed',
        description: 'Desc',
        siteUrl: 'https://example.com',
        feedType: 'rss',
        itemCount: 2,
      },
    ]);
  });

  it('collapses the same feed served at multiple URLs into one result', async () => {
    parseFeedMock.mockRejectedValueOnce(new Error('not a feed')); // direct attempt
    fetchMock.mockResolvedValueOnce({
      ok: true,
      url: 'https://example.com/',
      text: vi.fn().mockResolvedValue('<html><body>No advertised feeds</body></html>'),
    });
    // /feed and /feed/ both resolve to the same feed (same title + first item).
    parseFeedMock.mockImplementation(async (u: string) => {
      if (u === 'https://example.com/feed' || u === 'https://example.com/feed/') {
        return feed({ title: 'Same Feed', items: [{ guid: 'post-1' }, { guid: 'post-2' }] });
      }
      throw new Error('404');
    });

    const result = await discoverFeeds('example.com');

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://example.com/feed');
  });

  it('rejects discovered candidates that parse but have no items', async () => {
    parseFeedMock.mockRejectedValueOnce(new Error('not a feed')); // direct attempt
    fetchMock.mockResolvedValueOnce({
      ok: true,
      url: 'https://example.com/',
      text: vi.fn().mockResolvedValue(
        '<link rel="alternate" type="application/rss+xml" href="/empty.xml">',
      ),
    });
    parseFeedMock.mockResolvedValueOnce(feed({ items: [] }));

    expect(await discoverFeeds('example.com')).toEqual([]);
  });

  it('returns an empty list when the page is unreachable', async () => {
    parseFeedMock.mockRejectedValueOnce(new Error('not a feed'));
    fetchMock.mockRejectedValueOnce(new Error('ENOTFOUND'));
    parseFeedMock.mockRejectedValue(new Error('404'));

    expect(await discoverFeeds('does-not-exist.example')).toEqual([]);
  });
});
