import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../db/client.js';
import { parseFeed } from '../lib/feed-parser.js';
import {
  articleHtmlToText,
  sanitizeArticleDisplayHtml,
  sanitizeArticleImageUrl,
} from '../lib/html-sanitizer.js';
import {
  accessControlService,
  ResourceNotFoundError,
} from './access-control.service.js';
import { FeedService } from './feed.service.js';

vi.mock('../db/client.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('../lib/feed-parser.js', () => ({
  parseFeed: vi.fn(),
}));

vi.mock('../lib/html-sanitizer.js', () => ({
  articleHtmlToText: vi.fn((html: string) => html.replace(/<[^>]+>/g, ' ').trim()),
  sanitizeArticleDisplayHtml: vi.fn((content: string | null) => content ? `safe:${content}` : content),
  sanitizeArticleImageUrl: vi.fn((url: string | null) => url ? `img:${url}` : url),
}));

const addMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../queues/index.js', () => ({
  getContentExtractQueue: vi.fn(() => ({ add: addMock })),
  getRuleEngineQueue: vi.fn(() => ({ add: addMock })),
}));

vi.mock('./access-control.service.js', async () => {
  const actual = await vi.importActual<typeof import('./access-control.service.js')>('./access-control.service.js');
  return {
    ...actual,
    accessControlService: {
      assertFeedSubscribed: vi.fn(),
      listSubscribedFeedIds: vi.fn(),
    },
  };
});

function buildFeedListQuery(rows: unknown[]) {
  const offset = vi.fn().mockResolvedValue(rows);
  const limit = vi.fn(() => ({ offset }));
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));

  return { from, where, orderBy, limit, offset };
}

describe('feedService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subscribes to a new feed, inserts parsed articles, and creates the subscription', async () => {
    vi.mocked(parseFeed).mockResolvedValue({
      title: 'Feed Title',
      description: 'Feed description',
      siteUrl: 'https://example.com',
      feedType: 'rss',
      items: [
        {
          guid: 'guid-1',
          url: 'https://example.com/post-1',
          title: 'Post 1',
          author: 'Author',
          summary: 'Alpha summary',
          contentHtml: '<p>Alpha body</p>',
          imageUrl: 'https://example.com/image-1.jpg',
          publishedAt: new Date('2026-06-06T10:00:00.000Z'),
        },
        {
          guid: 'guid-2',
          url: 'https://example.com/post-2',
          title: 'Post 2',
          author: null,
          summary: 'Beta summary',
          contentHtml: null,
          imageUrl: null,
          publishedAt: null,
        },
        {
          guid: 'guid-3',
          url: 'https://example.com/post-3',
          title: 'Post 3',
          author: null,
          summary: null,
          contentHtml: '<p>Gamma body</p>',
          imageUrl: 'https://example.com/image-3.jpg',
          publishedAt: null,
        },
      ],
    } as never);

    const selectWhereExistingFeed = vi.fn().mockResolvedValue([]);
    const selectFromExistingFeed = vi.fn(() => ({ where: selectWhereExistingFeed }));
    const selectWhereExistingSub = vi.fn().mockResolvedValue([]);
    const selectFromExistingSub = vi.fn(() => ({ where: selectWhereExistingSub }));

    const feedReturning = vi.fn().mockResolvedValue([{
      id: 'feed-1',
      url: 'https://feeds.example.com/rss',
      title: 'Feed Title',
      description: 'Feed description',
      siteUrl: 'https://example.com',
      feedType: 'rss',
    }]);
    const feedValues = vi.fn(() => ({ returning: feedReturning }));

    const articleInsertResults = [
      { returning: vi.fn().mockResolvedValue([{ id: 'article-1' }]) },
      { returning: vi.fn().mockResolvedValue([]) },
      { returning: vi.fn().mockRejectedValue(new Error('duplicate')) },
    ];
    const articleOnConflict = articleInsertResults.map((result) => vi.fn(() => result));
    const articleValues = articleOnConflict.map((onConflictDoNothing) => vi.fn(() => ({ onConflictDoNothing })));

    const subscriptionReturning = vi.fn().mockResolvedValue([{
      id: 'sub-1',
      userId: 'user-1',
      feedId: 'feed-1',
      folderId: 'folder-1',
      customTitle: 'Custom',
    }]);
    const subscriptionValues = vi.fn(() => ({ returning: subscriptionReturning }));

    const insert = vi.fn()
      .mockReturnValueOnce({ values: feedValues })
      .mockReturnValueOnce({ values: articleValues[0] })
      .mockReturnValueOnce({ values: articleValues[1] })
      .mockReturnValueOnce({ values: articleValues[2] })
      .mockReturnValueOnce({ values: subscriptionValues });

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: selectFromExistingFeed })
        .mockReturnValueOnce({ from: selectFromExistingSub }),
      insert,
    } as never);

    const service = new FeedService();
    await expect(
      service.subscribe('user-1', 'https://feeds.example.com/rss', 'folder-1', 'Custom'),
    ).resolves.toEqual({
      feed: {
        id: 'feed-1',
        url: 'https://feeds.example.com/rss',
        title: 'Feed Title',
        description: 'Feed description',
        siteUrl: 'https://example.com',
        feedType: 'rss',
      },
      subscription: {
        id: 'sub-1',
        userId: 'user-1',
        feedId: 'feed-1',
        folderId: 'folder-1',
        customTitle: 'Custom',
      },
    });

    expect(feedValues).toHaveBeenCalledWith({
      url: 'https://feeds.example.com/rss',
      title: 'Feed Title',
      description: 'Feed description',
      siteUrl: 'https://example.com',
      feedType: 'rss',
    });
    expect(sanitizeArticleDisplayHtml).toHaveBeenNthCalledWith(1, '<p>Alpha body</p>', 'Alpha summary');
    expect(sanitizeArticleDisplayHtml).toHaveBeenNthCalledWith(2, null, 'Beta summary');
    expect(sanitizeArticleDisplayHtml).toHaveBeenNthCalledWith(3, '<p>Gamma body</p>', null);
    expect(articleHtmlToText).toHaveBeenNthCalledWith(1, 'safe:<p>Alpha body</p>');
    expect(articleHtmlToText).toHaveBeenNthCalledWith(2, 'safe:<p>Gamma body</p>');
    expect(sanitizeArticleImageUrl).toHaveBeenNthCalledWith(1, 'https://example.com/image-1.jpg');
    expect(sanitizeArticleImageUrl).toHaveBeenNthCalledWith(2, null);
    expect(sanitizeArticleImageUrl).toHaveBeenNthCalledWith(3, 'https://example.com/image-3.jpg');
    expect(subscriptionValues).toHaveBeenCalledWith({
      userId: 'user-1',
      feedId: 'feed-1',
      folderId: 'folder-1',
      customTitle: 'Custom',
    });
  });

  it('reuses existing feeds and rejects duplicate subscriptions', async () => {
    const feed = {
      id: 'feed-1',
      url: 'https://feeds.example.com/rss',
      title: 'Feed Title',
    };
    const selectWhereExistingFeed = vi.fn().mockResolvedValue([feed]);
    const selectFromExistingFeed = vi.fn(() => ({ where: selectWhereExistingFeed }));
    const selectWhereExistingSub = vi.fn().mockResolvedValue([{ id: 'sub-1' }]);
    const selectFromExistingSub = vi.fn(() => ({ where: selectWhereExistingSub }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: selectFromExistingFeed })
        .mockReturnValueOnce({ from: selectFromExistingSub }),
      insert: vi.fn(),
    } as never);

    const service = new FeedService();
    await expect(
      service.subscribe('user-1', 'https://feeds.example.com/rss'),
    ).rejects.toThrow('Already subscribed to this feed');

    expect(parseFeed).not.toHaveBeenCalled();
  });

  it('subscribes with null folder/custom titles and stores empty extracted text as null', async () => {
    vi.mocked(parseFeed).mockResolvedValue({
      title: 'Feed Title',
      description: 'Feed description',
      siteUrl: 'https://example.com',
      feedType: 'rss',
      items: [
        {
          guid: 'guid-empty',
          url: 'https://example.com/empty',
          title: 'Empty item',
          author: null,
          summary: undefined,
          contentHtml: null,
          imageUrl: null,
          publishedAt: null,
        },
      ],
    } as never);

    const selectWhereExistingFeed = vi.fn().mockResolvedValue([]);
    const selectFromExistingFeed = vi.fn(() => ({ where: selectWhereExistingFeed }));
    const selectWhereExistingSub = vi.fn().mockResolvedValue([]);
    const selectFromExistingSub = vi.fn(() => ({ where: selectWhereExistingSub }));

    const feedReturning = vi.fn().mockResolvedValue([{
      id: 'feed-2',
      url: 'https://feeds.example.com/empty',
      title: 'Feed Title',
      description: 'Feed description',
      siteUrl: 'https://example.com',
      feedType: 'rss',
    }]);
    const feedValues = vi.fn(() => ({ returning: feedReturning }));
    const articleReturning = vi.fn().mockResolvedValue([]);
    const articleOnConflict = vi.fn(() => ({ returning: articleReturning }));
    const articleValues = vi.fn(() => ({ onConflictDoNothing: articleOnConflict }));
    const subscriptionReturning = vi.fn().mockResolvedValue([{
      id: 'sub-2',
      userId: 'user-2',
      feedId: 'feed-2',
      folderId: null,
      customTitle: null,
    }]);
    const subscriptionValues = vi.fn(() => ({ returning: subscriptionReturning }));

    const insert = vi.fn()
      .mockReturnValueOnce({ values: feedValues })
      .mockReturnValueOnce({ values: articleValues })
      .mockReturnValueOnce({ values: subscriptionValues });

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: selectFromExistingFeed })
        .mockReturnValueOnce({ from: selectFromExistingSub }),
      insert,
    } as never);

    const service = new FeedService();
    await expect(service.subscribe('user-2', 'https://feeds.example.com/empty')).resolves.toEqual({
      feed: {
        id: 'feed-2',
        url: 'https://feeds.example.com/empty',
        title: 'Feed Title',
        description: 'Feed description',
        siteUrl: 'https://example.com',
        feedType: 'rss',
      },
      subscription: {
        id: 'sub-2',
        userId: 'user-2',
        feedId: 'feed-2',
        folderId: null,
        customTitle: null,
      },
    });

    expect(subscriptionValues).toHaveBeenCalledWith({
      userId: 'user-2',
      feedId: 'feed-2',
      folderId: null,
      customTitle: null,
    });
    expect(articleValues).toHaveBeenCalledWith(expect.objectContaining({
      summary: undefined,
      contentHtml: null,
      contentText: null,
      imageUrl: null,
      wordCount: 0,
    }));
  });

  it('updates subscription metadata and feed refresh intervals', async () => {
    const subWhere = vi.fn().mockResolvedValue(undefined);
    const subSet = vi.fn(() => ({ where: subWhere }));
    const feedWhere = vi.fn().mockResolvedValue(undefined);
    const feedSet = vi.fn(() => ({ where: feedWhere }));
    const update = vi.fn()
      .mockReturnValueOnce({ set: subSet })
      .mockReturnValueOnce({ set: feedSet })
      .mockReturnValueOnce({ set: feedSet });
    vi.mocked(getDb).mockReturnValue({
      update,
    } as never);
    vi.mocked(accessControlService.assertFeedSubscribed).mockResolvedValue(undefined);

    const service = new FeedService();
    await expect(service.updateSubscription('user-1', 'feed-1', {
      folderId: null,
      customTitle: 'Updated',
      notify: true,
      refreshInterval: 30,
    })).resolves.toBeUndefined();

    await expect(service.updateSubscription('user-1', 'feed-1', {
      refreshInterval: 60,
    })).resolves.toBeUndefined();

    expect(subSet).toHaveBeenCalledWith({
      folderId: null,
      customTitle: 'Updated',
      notify: 1,
    });
    expect(feedSet).toHaveBeenNthCalledWith(1, {
      refreshInterval: 30,
      updatedAt: expect.any(Date),
    });
    expect(feedSet).toHaveBeenNthCalledWith(2, {
      refreshInterval: 60,
      updatedAt: expect.any(Date),
    });
  });

  it('stores notify=false as 0 when updating subscriptions', async () => {
    const subWhere = vi.fn().mockResolvedValue(undefined);
    const subSet = vi.fn(() => ({ where: subWhere }));
    vi.mocked(getDb).mockReturnValue({
      update: vi.fn().mockReturnValue({ set: subSet }),
    } as never);
    vi.mocked(accessControlService.assertFeedSubscribed).mockResolvedValue(undefined);

    const service = new FeedService();
    await expect(service.updateSubscription('user-1', 'feed-1', {
      notify: false,
    })).resolves.toBeUndefined();

    expect(subSet).toHaveBeenCalledWith({
      notify: 0,
    });
  });

  it('unsubscribes a user from a feed', async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getDb).mockReturnValue({
      delete: vi.fn(() => ({ where: deleteWhere })),
    } as never);
    vi.mocked(accessControlService.assertFeedSubscribed).mockResolvedValue(undefined);

    const service = new FeedService();
    await expect(service.unsubscribe('user-1', 'feed-1')).resolves.toBeUndefined();
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });

  it('lists subscribed feeds with mapped dates and unread counts', async () => {
    const rows = [{
      feed: {
        id: 'feed-1',
        title: 'Feed Title',
        feedType: 'rss',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-06T00:00:00.000Z'),
        lastFetchedAt: new Date('2026-06-06T12:00:00.000Z'),
      },
      subscription: {
        id: 'sub-1',
        folderId: 'folder-1',
        customTitle: 'Custom',
        notify: 1,
      },
      unreadCount: 7,
    }];
    const listQuery = buildFeedListQuery(rows);
    const totalWhere = vi.fn().mockResolvedValue([{ total: 3 }]);
    const totalFrom = vi.fn(() => ({ where: totalWhere }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: listQuery.from })
        .mockReturnValueOnce({ from: totalFrom }),
    } as never);

    const service = new FeedService();
    await expect(service.listForUser('user-1', {
      folderId: 'folder-1',
      page: 2,
      pageSize: 1,
    })).resolves.toEqual({
      items: [{
        id: 'feed-1',
        title: 'Feed Title',
        feedType: 'rss',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-06T00:00:00.000Z',
        lastFetchedAt: '2026-06-06T12:00:00.000Z',
        subscriptionId: 'sub-1',
        folderId: 'folder-1',
        customTitle: 'Custom',
        notify: true,
        unreadCount: 7,
      }],
      total: 3,
      page: 2,
      pageSize: 1,
      hasMore: true,
    });

    expect(listQuery.where).toHaveBeenCalledTimes(1);
  });

  it('uses default pagination values and maps missing lastFetchedAt to null', async () => {
    const rows = [{
      feed: {
        id: 'feed-2',
        title: 'Another Feed',
        feedType: 'json',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-06T00:00:00.000Z'),
        lastFetchedAt: null,
      },
      subscription: {
        id: 'sub-2',
        folderId: null,
        customTitle: null,
        notify: 0,
      },
      unreadCount: 0,
    }];
    const listQuery = buildFeedListQuery(rows);
    const totalWhere = vi.fn().mockResolvedValue([{ total: 1 }]);
    const totalFrom = vi.fn(() => ({ where: totalWhere }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: listQuery.from })
        .mockReturnValueOnce({ from: totalFrom }),
    } as never);

    const service = new FeedService();
    await expect(service.listForUser('user-1', {})).resolves.toEqual({
      items: [{
        id: 'feed-2',
        title: 'Another Feed',
        feedType: 'json',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-06T00:00:00.000Z',
        lastFetchedAt: null,
        subscriptionId: 'sub-2',
        folderId: null,
        customTitle: null,
        notify: false,
        unreadCount: 0,
      }],
      total: 1,
      page: 1,
      pageSize: 50,
      hasMore: false,
    });

    expect(listQuery.limit).toHaveBeenCalledWith(50);
    expect(listQuery.offset).toHaveBeenCalledWith(0);
  });

  it('delegates subscribed feed id lookups to access control', async () => {
    vi.mocked(accessControlService.listSubscribedFeedIds).mockResolvedValue(['feed-1', 'feed-2']);

    const service = new FeedService();
    await expect(service.listSubscribedFeedIds('user-1')).resolves.toEqual(['feed-1', 'feed-2']);
  });

  it('throws when refreshFeed cannot find the feed', async () => {
    const selectWhere = vi.fn().mockResolvedValue([]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({ from: selectFrom }),
    } as never);

    const service = new FeedService();
    await expect(service.refreshFeed('missing')).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it('refreshes feeds, inserts new articles, and clears errors on success', async () => {
    const feed = {
      id: 'feed-1',
      url: 'https://feeds.example.com/rss',
      title: 'Old title',
      description: 'Old description',
      siteUrl: 'https://old.example.com',
      feedType: 'rss',
      errorCount: 2,
    };
    const selectWhere = vi.fn().mockResolvedValue([feed]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    vi.mocked(parseFeed).mockResolvedValue({
      title: 'New title',
      description: 'New description',
      siteUrl: 'https://new.example.com',
      feedType: 'atom',
      items: [
        {
          guid: 'guid-1',
          url: 'https://example.com/post-1',
          title: 'Post 1',
          author: 'Author',
          summary: 'Summary',
          contentHtml: '<p>Body</p>',
          imageUrl: 'https://example.com/image.jpg',
          publishedAt: null,
        },
      ],
    } as never);

    const articleReturning = vi.fn().mockResolvedValue([{ id: 'article-1' }]);
    const articleOnConflict = vi.fn(() => ({ returning: articleReturning }));
    const articleValues = vi.fn(() => ({ onConflictDoNothing: articleOnConflict }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const insert = vi.fn().mockReturnValue({ values: articleValues });

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({ from: selectFrom }),
      insert,
      update: vi.fn(() => ({ set: updateSet })),
    } as never);
    vi.mocked(accessControlService.assertFeedSubscribed).mockResolvedValue(undefined);

    const service = new FeedService();
    await expect(service.refreshFeed('feed-1', { userId: 'user-1' })).resolves.toEqual({
      newArticles: 1,
      newArticleIds: ['article-1'],
    });

    expect(accessControlService.assertFeedSubscribed).toHaveBeenCalledWith('user-1', 'feed-1');
    expect(updateSet).toHaveBeenCalledWith({
      title: 'New title',
      description: 'New description',
      siteUrl: 'https://new.example.com',
      feedType: 'atom',
      lastFetchedAt: expect.any(Date),
      lastError: null,
      errorCount: 0,
      updatedAt: expect.any(Date),
    });
  });

  it('falls back to existing feed metadata when refreshed feed fields are missing', async () => {
    const feed = {
      id: 'feed-2',
      url: 'https://feeds.example.com/rss',
      title: 'Keep title',
      description: 'Keep description',
      siteUrl: 'https://keep.example.com',
      feedType: 'rss',
      errorCount: 0,
    };
    const selectWhere = vi.fn().mockResolvedValue([feed]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    vi.mocked(parseFeed).mockResolvedValue({
      title: null,
      description: null,
      siteUrl: null,
      feedType: 'web_monitor',
      items: [],
    } as never);

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({ from: selectFrom }),
      update: vi.fn(() => ({ set: updateSet })),
    } as never);

    const service = new FeedService();
    await expect(service.refreshFeed('feed-2')).resolves.toEqual({
      newArticles: 0,
      newArticleIds: [],
    });

    expect(updateSet).toHaveBeenCalledWith({
      title: 'Keep title',
      description: 'Keep description',
      siteUrl: 'https://keep.example.com',
      feedType: 'web_monitor',
      lastFetchedAt: expect.any(Date),
      lastError: null,
      errorCount: 0,
      updatedAt: expect.any(Date),
    });
  });

  it('records refresh errors and rethrows them', async () => {
    const feed = {
      id: 'feed-1',
      url: 'https://feeds.example.com/rss',
      title: 'Title',
      description: 'Description',
      siteUrl: 'https://example.com',
      feedType: 'rss',
      errorCount: 4,
    };
    const selectWhere = vi.fn().mockResolvedValue([feed]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    vi.mocked(parseFeed).mockRejectedValue(new Error('fetch failed'));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({ from: selectFrom }),
      update: vi.fn(() => ({ set: updateSet })),
    } as never);

    const service = new FeedService();
    await expect(service.refreshFeed('feed-1')).rejects.toThrow('fetch failed');
    expect(updateSet).toHaveBeenCalledWith({
      lastError: 'fetch failed',
      errorCount: 5,
      updatedAt: expect.any(Date),
    });
  });

  it('records unknown refresh errors when the thrown value is not an Error', async () => {
    const feed = {
      id: 'feed-2',
      url: 'https://feeds.example.com/rss',
      title: 'Title',
      description: 'Description',
      siteUrl: 'https://example.com',
      feedType: 'rss',
      errorCount: 1,
    };
    const selectWhere = vi.fn().mockResolvedValue([feed]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    vi.mocked(parseFeed).mockRejectedValue('boom');
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({ from: selectFrom }),
      update: vi.fn(() => ({ set: updateSet })),
    } as never);

    const service = new FeedService();
    await expect(service.refreshFeed('feed-2')).rejects.toBe('boom');
    expect(updateSet).toHaveBeenCalledWith({
      lastError: 'Unknown error',
      errorCount: 2,
      updatedAt: expect.any(Date),
    });
  });
});
