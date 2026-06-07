import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  parseStringMock,
  ParserFake,
  fetchMock,
  timeoutMock,
  randomUUIDMock,
} = vi.hoisted(() => {
  const parseStringMock = vi.fn();
  class ParserFake {
    parseString = parseStringMock;
  }
  const fetchMock = vi.fn();
  const timeoutMock = vi.fn(() => 'timeout-signal');
  const randomUUIDMock = vi.fn(() => 'generated-uuid');

  return {
    parseStringMock,
    ParserFake,
    fetchMock,
    timeoutMock,
    randomUUIDMock,
  };
});

vi.mock('rss-parser', () => ({
  __esModule: true,
  default: ParserFake,
}));

describe('feed parser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('AbortSignal', { timeout: timeoutMock });
    vi.stubGlobal('crypto', { randomUUID: randomUUIDMock });
  });

  it('parses json feeds from the content-type header', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1',
        title: 'JSON Feed',
        description: 'Desc',
        home_page_url: 'https://example.com',
        items: [
          {
            id: 'item-1',
            url: 'https://example.com/post',
            title: 'Post',
            summary: 'Summary',
            content_html: '<p>Body</p><img src="https://cdn.example.com/lead.jpg">',
            authors: [{ name: 'Author' }],
            date_published: '2026-06-06T12:00:00.000Z',
          },
        ],
      })),
      headers: {
        get: vi.fn(() => 'application/feed+json; charset=utf-8'),
      },
    });

    const { parseFeed } = await import('./feed-parser.js');
    await expect(parseFeed('https://feeds.example.com/json')).resolves.toEqual({
      title: 'JSON Feed',
      description: 'Desc',
      siteUrl: 'https://example.com',
      feedType: 'json',
      items: [
        {
          guid: 'item-1',
          url: 'https://example.com/post',
          title: 'Post',
          author: 'Author',
          summary: 'Summary',
          contentHtml: '<p>Body</p><img src="https://cdn.example.com/lead.jpg">',
          imageUrl: 'https://cdn.example.com/lead.jpg',
          publishedAt: new Date('2026-06-06T12:00:00.000Z'),
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://feeds.example.com/json',
      {
        headers: {
          'User-Agent': 'NewsReader/1.0',
          Accept: 'application/rss+xml, application/atom+xml, application/xml, application/feed+json, text/xml',
        },
        signal: 'timeout-signal',
        redirect: 'follow',
      },
    );
    expect(timeoutMock).toHaveBeenCalledWith(15000);
  });

  it('parses json feeds even when the server misreports content-type', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1',
        title: 'Fallback JSON',
        items: [
          {
            title: 'Untitled',
            external_url: 'https://example.com/offsite',
            author: { name: 'Named author' },
            content_html: '<p>Body</p>',
            image: 'https://example.com/image.jpg',
          },
        ],
      })),
      headers: {
        get: vi.fn(() => 'text/plain'),
      },
    });

    const { parseFeed } = await import('./feed-parser.js');
    const result = await parseFeed('https://feeds.example.com/misreported');

    expect(result.feedType).toBe('json');
    expect(result.items[0]).toMatchObject({
      guid: 'Untitled',
      url: 'https://example.com/offsite',
      author: 'Named author',
      imageUrl: 'https://example.com/image.jpg',
    });
  });

  it('handles json feeds with missing item arrays and missing header content types', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1',
        title: 'Headerless JSON',
      })),
      headers: {
        get: vi.fn(() => null),
      },
    });

    const { parseFeed } = await import('./feed-parser.js');
    await expect(parseFeed('https://feeds.example.com/headerless-json')).resolves.toEqual({
      title: 'Headerless JSON',
      description: null,
      siteUrl: null,
      feedType: 'json',
      items: [],
    });
  });

  it('parses atom and rss feeds through rss-parser', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(
          '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>',
        ),
        headers: {
          get: vi.fn(() => 'application/xml'),
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('<rss version="2.0"></rss>'),
        headers: {
          get: vi.fn(() => 'application/rss+xml'),
        },
      });

    parseStringMock
      .mockResolvedValueOnce({
        title: 'Atom Feed',
        description: 'Atom desc',
        link: 'https://example.com',
        items: [
          {
            guid: 'atom-1',
            link: 'https://example.com/atom',
            title: 'Atom story',
            creator: 'Atom author',
            summary: 'Atom summary',
            content: '<img src="https://example.com/atom.jpg">',
            isoDate: '2026-06-05T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        title: 'RSS Feed',
        description: null,
        link: null,
        items: [
          {
            link: 'https://example.com/rss',
            author: 'RSS author',
            contentSnippet: 'Snippet',
            'content:encoded': '<p>Body</p>',
            enclosure: { type: 'image/jpeg', url: 'https://example.com/rss.jpg' },
          },
          {
            title: 'Generated ID',
          },
        ],
      });

    const { parseFeed } = await import('./feed-parser.js');

    await expect(parseFeed('https://feeds.example.com/atom')).resolves.toEqual({
      title: 'Atom Feed',
      description: 'Atom desc',
      siteUrl: 'https://example.com',
      feedType: 'atom',
      items: [
        {
          guid: 'atom-1',
          url: 'https://example.com/atom',
          title: 'Atom story',
          author: 'Atom author',
          summary: 'Atom summary',
          contentHtml: '<img src="https://example.com/atom.jpg">',
          imageUrl: 'https://example.com/atom.jpg',
          publishedAt: new Date('2026-06-05T00:00:00.000Z'),
        },
      ],
    });

    await expect(parseFeed('https://feeds.example.com/rss')).resolves.toEqual({
      title: 'RSS Feed',
      description: null,
      siteUrl: null,
      feedType: 'rss',
      items: [
        {
          guid: 'https://example.com/rss',
          url: 'https://example.com/rss',
          title: null,
          author: 'RSS author',
          summary: 'Snippet',
          contentHtml: '<p>Body</p>',
          imageUrl: 'https://example.com/rss.jpg',
          publishedAt: null,
        },
        {
          guid: 'Generated ID',
          url: null,
          title: 'Generated ID',
          author: null,
          summary: null,
          contentHtml: null,
          imageUrl: null,
          publishedAt: null,
        },
      ],
    });
  });

  it('extracts images from media:content, media:thumbnail, and itunes:image', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('<rss version="2.0"></rss>'),
        headers: { get: vi.fn(() => 'application/rss+xml') },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('<rss version="2.0"></rss>'),
        headers: { get: vi.fn(() => 'application/rss+xml') },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('<rss version="2.0"></rss>'),
        headers: { get: vi.fn(() => 'application/rss+xml') },
      });

    parseStringMock
      .mockResolvedValueOnce({
        title: 'Media RSS Feed',
        items: [
          {
            guid: 'media-1',
            link: 'https://example.com/media',
            title: 'Media Content Image',
            'media:content': { $: { url: 'https://cdn.example.com/media.jpg', medium: 'image' } },
          },
        ],
      })
      .mockResolvedValueOnce({
        title: 'Thumbnail Feed',
        items: [
          {
            guid: 'thumb-1',
            link: 'https://example.com/thumb',
            title: 'Thumbnail Image',
            'media:thumbnail': { $: { url: 'https://cdn.example.com/thumb.jpg' } },
          },
        ],
      })
      .mockResolvedValueOnce({
        title: 'Podcast Feed',
        items: [
          {
            guid: 'pod-1',
            link: 'https://example.com/episode',
            title: 'Podcast Episode',
            'itunes:image': { $: { href: 'https://cdn.example.com/podcast.jpg' } },
          },
        ],
      });

    const { parseFeed } = await import('./feed-parser.js');

    const mediaResult = await parseFeed('https://feeds.example.com/media-rss');
    expect(mediaResult.items[0].imageUrl).toBe('https://cdn.example.com/media.jpg');

    const thumbResult = await parseFeed('https://feeds.example.com/thumb-rss');
    expect(thumbResult.items[0].imageUrl).toBe('https://cdn.example.com/thumb.jpg');

    const podcastResult = await parseFeed('https://feeds.example.com/podcast');
    expect(podcastResult.items[0].imageUrl).toBe('https://cdn.example.com/podcast.jpg');
  });

  it('prefers enclosure over media:content over media:thumbnail over itunes:image over content img', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('<rss version="2.0"></rss>'),
      headers: { get: vi.fn(() => 'application/rss+xml') },
    });

    parseStringMock.mockResolvedValueOnce({
      title: 'Priority Feed',
      items: [
        {
          guid: 'all-sources',
          link: 'https://example.com/all',
          title: 'All Image Sources',
          enclosure: { type: 'image/png', url: 'https://example.com/enclosure.png' },
          'media:content': { $: { url: 'https://example.com/media.jpg' } },
          'media:thumbnail': { $: { url: 'https://example.com/thumb.jpg' } },
          'itunes:image': { $: { href: 'https://example.com/itunes.jpg' } },
          content: '<img src="https://example.com/content.jpg">',
        },
        {
          guid: 'no-enclosure',
          link: 'https://example.com/no-enc',
          title: 'No Enclosure',
          'media:content': { $: { url: 'https://example.com/media-wins.jpg' } },
          'media:thumbnail': { $: { url: 'https://example.com/thumb.jpg' } },
          content: '<img src="https://example.com/content.jpg">',
        },
        {
          guid: 'thumb-only',
          link: 'https://example.com/thumb-only',
          title: 'Thumbnail Only',
          'media:thumbnail': { $: { url: 'https://example.com/thumb-wins.jpg' } },
          content: '<img src="https://example.com/content.jpg">',
        },
      ],
    });

    const { parseFeed } = await import('./feed-parser.js');
    const result = await parseFeed('https://feeds.example.com/priority');

    expect(result.items[0].imageUrl).toBe('https://example.com/enclosure.png');
    expect(result.items[1].imageUrl).toBe('https://example.com/media-wins.jpg');
    expect(result.items[2].imageUrl).toBe('https://example.com/thumb-wins.jpg');
  });

  it('handles rss-parser feeds with missing items, missing enclosure urls, and generated ids', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('<rss version="2.0"></rss>'),
      headers: {
        get: vi.fn(() => 'application/rss+xml'),
      },
    });

    parseStringMock
      .mockResolvedValueOnce({
        title: null,
        description: 'Desc',
        link: 'https://example.com',
        items: undefined,
      })
      .mockResolvedValueOnce({
        title: null,
        description: null,
        link: null,
        items: [
          {
            enclosure: { type: 'image/jpeg' },
            content: '<p>Body</p>',
          },
          {},
        ],
      });

    const { parseFeed } = await import('./feed-parser.js');

    await expect(parseFeed('https://feeds.example.com/rss-empty')).resolves.toEqual({
      title: null,
      description: 'Desc',
      siteUrl: 'https://example.com',
      feedType: 'rss',
      items: [],
    });

    await expect(parseFeed('https://feeds.example.com/rss-generated')).resolves.toEqual({
      title: null,
      description: null,
      siteUrl: null,
      feedType: 'rss',
      items: [
        {
          guid: 'generated-uuid',
          url: null,
          title: null,
          author: null,
          summary: null,
          contentHtml: '<p>Body</p>',
          imageUrl: null,
          publishedAt: null,
        },
        {
          guid: 'generated-uuid',
          url: null,
          title: null,
          author: null,
          summary: null,
          contentHtml: null,
          imageUrl: null,
          publishedAt: null,
        },
      ],
    });
    expect(randomUUIDMock).toHaveBeenCalledTimes(2);
  });

  it('falls through invalid json payloads before detecting rss', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('{not valid json'),
        headers: {
          get: vi.fn(() => 'application/json'),
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('   {still not json'),
        headers: {
          get: vi.fn(() => 'text/plain'),
        },
      });

    parseStringMock
      .mockResolvedValueOnce({
        title: 'Fallback RSS',
        description: null,
        link: null,
        items: [],
      })
      .mockResolvedValueOnce({
        title: 'Second RSS',
        description: null,
        link: null,
        items: [],
      });

    const { parseFeed } = await import('./feed-parser.js');

    await expect(parseFeed('https://feeds.example.com/bad-json-header')).resolves.toMatchObject({
      feedType: 'rss',
      title: 'Fallback RSS',
    });
    await expect(parseFeed('https://feeds.example.com/bad-json-body')).resolves.toMatchObject({
      feedType: 'rss',
      title: 'Second RSS',
    });
  });

  it('surfaces fetch failures and generates ids when no fallback fields exist', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          version: 'https://jsonfeed.org/version/1.1',
          items: [{}],
        })),
        headers: {
          get: vi.fn(() => 'application/json'),
        },
      });

    const { parseFeed } = await import('./feed-parser.js');

    await expect(parseFeed('https://feeds.example.com/down')).rejects.toThrow(
      'Failed to fetch feed: HTTP 503',
    );

    const result = await parseFeed('https://feeds.example.com/generated-id');
    expect(result.items[0]?.guid).toBe('generated-uuid');
    expect(randomUUIDMock).toHaveBeenCalled();
  });
});
