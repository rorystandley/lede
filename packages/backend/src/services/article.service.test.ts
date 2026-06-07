import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../db/client.js';
import {
  sanitizeArticleDisplayHtml,
  sanitizeArticleImageUrl,
} from '../lib/html-sanitizer.js';
import { accessControlService } from './access-control.service.js';
import { ArticleService } from './article.service.js';

vi.mock('../db/client.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('../lib/html-sanitizer.js', () => ({
  sanitizeArticleDisplayHtml: vi.fn((content: string | null) => content ? `safe:${content}` : content),
  sanitizeArticleImageUrl: vi.fn((url: string | null) => url ? `img:${url}` : url),
}));

vi.mock('./access-control.service.js', async () => {
  const actual = await vi.importActual<typeof import('./access-control.service.js')>('./access-control.service.js');
  return {
    ...actual,
    accessControlService: {
      assertArticlesAccessible: vi.fn(),
      assertArticleAccessible: vi.fn(),
      assertFeedSubscribed: vi.fn(),
    },
  };
});

function buildListLikeQuery(rows: unknown[]) {
  const offset = vi.fn().mockResolvedValue(rows);
  const limit = vi.fn(() => ({ offset }));
  const orderBy = vi.fn(() => ({ limit }));
  const query = {
    where: vi.fn(() => query),
    orderBy,
  };

  return { query, offset, limit, orderBy };
}

function buildArticleJoinChain(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const leftJoin = vi.fn(() => ({ where }));
  const secondInnerJoin = vi.fn(() => ({ leftJoin }));
  const firstInnerJoin = vi.fn(() => ({ innerJoin: secondInnerJoin }));
  const from = vi.fn(() => ({ innerJoin: firstInnerJoin }));

  return { from, where };
}

describe('articleService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists articles with feed, folder, read, and starred filters applied', async () => {
    const createdAt = new Date('2026-06-06T12:00:00.000Z');
    const publishedAt = new Date('2026-06-06T10:00:00.000Z');
    const rows = [{
      article: {
        id: 'article-1',
        title: 'Story',
        summary: 'Summary',
        contentHtml: '<p>Body</p>',
        imageUrl: 'https://example.com/image.jpg',
        createdAt,
        publishedAt,
      },
      feedTitle: 'Feed',
      feedFaviconUrl: 'https://example.com/favicon.ico',
      isRead: true,
      isStarred: false,
      isArchived: false,
    }];
    const { query, orderBy } = buildListLikeQuery(rows);
    const dynamic = vi.fn(() => query);
    const leftJoin = vi.fn(() => ({ $dynamic: dynamic }));
    const secondInnerJoin = vi.fn(() => ({ leftJoin }));
    const firstInnerJoin = vi.fn(() => ({ innerJoin: secondInnerJoin }));
    const primaryFrom = vi.fn(() => ({ innerJoin: firstInnerJoin }));
    const subqueryWhere = vi.fn().mockReturnValue('folder-feeds');
    const subqueryFrom = vi.fn(() => ({ where: subqueryWhere }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: primaryFrom })
        .mockReturnValueOnce({ from: subqueryFrom }),
    } as never);

    const service = new ArticleService();
    await expect(service.list('user-1', {
      page: 1,
      pageSize: 2,
      sort: 'created_at',
      order: 'asc',
      feedId: 'feed-1',
      folderId: 'folder-1',
      isRead: false,
      isStarred: false,
    })).resolves.toEqual({
      items: [{
        id: 'article-1',
        title: 'Story',
        summary: 'Summary',
        contentHtml: 'safe:<p>Body</p>',
        imageUrl: 'img:https://example.com/image.jpg',
        createdAt: '2026-06-06T12:00:00.000Z',
        publishedAt: '2026-06-06T10:00:00.000Z',
        feedTitle: 'Feed',
        feedFaviconUrl: 'https://example.com/favicon.ico',
        isRead: true,
        isStarred: false,
        isArchived: false,
        tags: [],
      }],
      total: 1,
      page: 1,
      pageSize: 2,
      hasMore: false,
    });

    expect(query.where).toHaveBeenCalledTimes(4);
    expect(orderBy).toHaveBeenCalledTimes(1);
    expect(sanitizeArticleDisplayHtml).toHaveBeenCalledWith('<p>Body</p>', 'Summary');
    expect(sanitizeArticleImageUrl).toHaveBeenCalledWith('https://example.com/image.jpg');
  });

  it('runs a real count query for paginated list pages beyond the first', async () => {
    const rows = [{
      article: {
        id: 'article-1',
        title: 'Story',
        summary: null,
        contentHtml: null,
        imageUrl: null,
        createdAt: new Date('2026-06-06T12:00:00.000Z'),
        publishedAt: null,
      },
      feedTitle: 'Feed',
      feedFaviconUrl: null,
      isRead: false,
      isStarred: true,
      isArchived: true,
    }];
    const { query } = buildListLikeQuery(rows);
    const dynamic = vi.fn(() => query);
    const leftJoin = vi.fn(() => ({ $dynamic: dynamic }));
    const secondInnerJoin = vi.fn(() => ({ leftJoin }));
    const firstInnerJoin = vi.fn(() => ({ innerJoin: secondInnerJoin }));
    const primaryFrom = vi.fn(() => ({ innerJoin: firstInnerJoin }));

    const countQuery = { where: vi.fn() as ReturnType<typeof vi.fn> & { mockReturnValue: (v: unknown) => unknown } };
    countQuery.where.mockReturnValue(countQuery);
    const countDynamic = vi.fn().mockResolvedValue([{ count: 5 }]);
    const countLeftJoin = vi.fn(() => ({ $dynamic: countDynamic }));
    const countSecondInnerJoin = vi.fn(() => ({ leftJoin: countLeftJoin }));
    const countFirstInnerJoin = vi.fn(() => ({ innerJoin: countSecondInnerJoin }));
    const countFrom = vi.fn(() => ({ innerJoin: countFirstInnerJoin }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: primaryFrom })
        .mockReturnValueOnce({ from: countFrom }),
    } as never);

    const service = new ArticleService();
    const result = await service.list('user-1', {
      page: 2,
      pageSize: 1,
      sort: 'published_at',
      order: 'desc',
    });

    expect(result.total).toBe(5);
    expect(result.hasMore).toBe(true);
  });

  it('applies the read=true filter branch when requested', async () => {
    const { query } = buildListLikeQuery([]);
    const dynamic = vi.fn(() => query);
    const leftJoin = vi.fn(() => ({ $dynamic: dynamic }));
    const secondInnerJoin = vi.fn(() => ({ leftJoin }));
    const firstInnerJoin = vi.fn(() => ({ innerJoin: secondInnerJoin }));
    const primaryFrom = vi.fn(() => ({ innerJoin: firstInnerJoin }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({ from: primaryFrom }),
    } as never);

    const service = new ArticleService();
    await service.list('user-1', {
      page: 1,
      pageSize: 10,
      sort: 'published_at',
      order: 'desc',
      isRead: true,
    });

    expect(query.where).toHaveBeenCalledTimes(1);
  });

  it('returns null when getById cannot find an accessible article', async () => {
    const { from } = buildArticleJoinChain([]);
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({ from }),
    } as never);

    const service = new ArticleService();
    await expect(service.getById('user-1', 'missing')).resolves.toBeNull();
  });

  it('returns an article with mapped tags when getById succeeds', async () => {
    const row = {
      article: {
        id: 'article-1',
        title: 'Story',
        summary: 'Summary',
        contentHtml: '<p>Body</p>',
        imageUrl: 'https://example.com/image.jpg',
        createdAt: new Date('2026-06-06T12:00:00.000Z'),
        publishedAt: new Date('2026-06-06T10:00:00.000Z'),
      },
      feedTitle: 'Feed',
      feedFaviconUrl: 'https://example.com/favicon.ico',
      isRead: true,
      isStarred: false,
      isArchived: true,
    };
    const articleSelect = buildArticleJoinChain([row]);
    const tagsWhere = vi.fn().mockResolvedValue([{ id: 'tag-1', name: 'AI', color: '#fff' }]);
    const tagsJoin = vi.fn(() => ({ where: tagsWhere }));
    const tagsFrom = vi.fn(() => ({ innerJoin: tagsJoin }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: articleSelect.from })
        .mockReturnValueOnce({ from: tagsFrom }),
    } as never);

    const service = new ArticleService();
    await expect(service.getById('user-1', 'article-1')).resolves.toEqual({
      id: 'article-1',
      title: 'Story',
      summary: 'Summary',
      contentHtml: 'safe:<p>Body</p>',
      imageUrl: 'img:https://example.com/image.jpg',
      createdAt: '2026-06-06T12:00:00.000Z',
      publishedAt: '2026-06-06T10:00:00.000Z',
      feedTitle: 'Feed',
      feedFaviconUrl: 'https://example.com/favicon.ico',
      isRead: true,
      isStarred: false,
      isArchived: true,
      tags: [{ id: 'tag-1', name: 'AI', color: '#fff' }],
    });
  });

  it('maps a null publishedAt value when getById succeeds', async () => {
    const row = {
      article: {
        id: 'article-2',
        title: 'Story',
        summary: null,
        contentHtml: null,
        imageUrl: null,
        createdAt: new Date('2026-06-06T12:00:00.000Z'),
        publishedAt: null,
      },
      feedTitle: 'Feed',
      feedFaviconUrl: null,
      isRead: false,
      isStarred: false,
      isArchived: false,
    };
    const articleSelect = buildArticleJoinChain([row]);
    const tagsWhere = vi.fn().mockResolvedValue([]);
    const tagsJoin = vi.fn(() => ({ where: tagsWhere }));
    const tagsFrom = vi.fn(() => ({ innerJoin: tagsJoin }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: articleSelect.from })
        .mockReturnValueOnce({ from: tagsFrom }),
    } as never);

    const service = new ArticleService();
    await expect(service.getById('user-1', 'article-2')).resolves.toEqual({
      id: 'article-2',
      title: 'Story',
      summary: null,
      contentHtml: null,
      imageUrl: null,
      createdAt: '2026-06-06T12:00:00.000Z',
      publishedAt: null,
      feedTitle: 'Feed',
      feedFaviconUrl: null,
      isRead: false,
      isStarred: false,
      isArchived: false,
      tags: [],
    });
  });

  it('marks articles read and unread through upserts on accessible ids', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn(() => ({ values })),
    } as never);
    vi.mocked(accessControlService.assertArticlesAccessible)
      .mockResolvedValueOnce(['article-1', 'article-2'])
      .mockResolvedValueOnce(['article-3']);

    const service = new ArticleService();
    await expect(service.markRead('user-1', ['article-1', 'article-2'])).resolves.toBeUndefined();
    await expect(service.markUnread('user-1', ['article-3'])).resolves.toBeUndefined();

    expect(values).toHaveBeenNthCalledWith(1, expect.objectContaining({
      userId: 'user-1',
      articleId: 'article-1',
      isRead: true,
      readAt: expect.any(Date),
    }));
    expect(values).toHaveBeenNthCalledWith(3, {
      userId: 'user-1',
      articleId: 'article-3',
      isRead: false,
    });
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(3);
  });

  it('marks all unread articles in scope and returns the affected count', async () => {
    const query = {
      where: vi.fn(() => query),
      limit: vi.fn().mockResolvedValue([{ id: 'article-1' }, { id: 'article-2' }]),
    };
    const dynamic = vi.fn(() => query);
    const leftJoin = vi.fn(() => ({ where: vi.fn(() => ({ $dynamic: dynamic })) }));
    const articleFrom = vi.fn(() => ({ leftJoin }));
    const folderFeedsWhere = vi.fn().mockReturnValue('folder-feeds');
    const folderFeedsFrom = vi.fn(() => ({ where: folderFeedsWhere }));
    const subscribedFeedsWhere = vi.fn().mockReturnValue('subscribed-feeds');
    const subscribedFeedsFrom = vi.fn(() => ({ where: subscribedFeedsWhere }));
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: subscribedFeedsFrom })
        .mockReturnValueOnce({ from: articleFrom })
        .mockReturnValueOnce({ from: folderFeedsFrom }),
    } as never);
    vi.mocked(accessControlService.assertFeedSubscribed).mockResolvedValue(undefined);

    const service = new ArticleService();
    const markReadSpy = vi.spyOn(service, 'markRead').mockResolvedValue(undefined);

    await expect(service.markAllRead('user-1', {
      feedId: 'feed-1',
      folderId: 'folder-1',
    })).resolves.toBe(2);

    expect(accessControlService.assertFeedSubscribed).toHaveBeenCalledWith('user-1', 'feed-1');
    expect(query.where).toHaveBeenCalledTimes(2);
    expect(markReadSpy).toHaveBeenCalledWith('user-1', ['article-1', 'article-2']);
  });

  it('returns zero from markAllRead when there are no unread matches', async () => {
    const query = {
      where: vi.fn(() => query),
      limit: vi.fn().mockResolvedValue([]),
    };
    const dynamic = vi.fn(() => query);
    const leftJoin = vi.fn(() => ({ where: vi.fn(() => ({ $dynamic: dynamic })) }));
    const articleFrom = vi.fn(() => ({ leftJoin }));
    const subscribedFeedsWhere = vi.fn().mockReturnValue('subscribed-feeds');
    const subscribedFeedsFrom = vi.fn(() => ({ where: subscribedFeedsWhere }));
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: subscribedFeedsFrom })
        .mockReturnValueOnce({ from: articleFrom }),
    } as never);

    const service = new ArticleService();
    const markReadSpy = vi.spyOn(service, 'markRead').mockResolvedValue(undefined);

    await expect(service.markAllRead('user-1', {})).resolves.toBe(0);
    expect(markReadSpy).not.toHaveBeenCalled();
  });

  it('sets article star and archive states after access checks', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn(() => ({ values })),
    } as never);
    vi.mocked(accessControlService.assertArticleAccessible).mockResolvedValue(undefined);

    const service = new ArticleService();
    await expect(service.setStar('user-1', 'article-1', true)).resolves.toBeUndefined();
    await expect(service.setArchived('user-1', 'article-1', false)).resolves.toBeUndefined();

    expect(accessControlService.assertArticleAccessible).toHaveBeenNthCalledWith(1, 'user-1', 'article-1');
    expect(accessControlService.assertArticleAccessible).toHaveBeenNthCalledWith(2, 'user-1', 'article-1');
    expect(values).toHaveBeenNthCalledWith(1, {
      userId: 'user-1',
      articleId: 'article-1',
      isStarred: true,
    });
    expect(values).toHaveBeenNthCalledWith(2, {
      userId: 'user-1',
      articleId: 'article-1',
      isArchived: false,
    });
  });

  it('returns an empty search result when the query sanitizes to no words', async () => {
    const subscribedFeedsWhere = vi.fn().mockReturnValue('subscribed-feeds');
    const subscribedFeedsFrom = vi.fn(() => ({ where: subscribedFeedsWhere }));
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({ from: subscribedFeedsFrom }),
    } as never);

    const service = new ArticleService();
    await expect(service.search('user-1', {
      q: '!!! ***',
      page: 1,
      pageSize: 10,
    })).resolves.toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      hasMore: false,
    });
  });

  it('searches subscribed articles and maps the results', async () => {
    const rows = [{
      article: {
        id: 'article-1',
        title: 'Search hit',
        summary: 'Summary',
        contentHtml: '<p>Body</p>',
        imageUrl: 'https://example.com/image.jpg',
        createdAt: new Date('2026-06-06T12:00:00.000Z'),
        publishedAt: new Date('2026-06-06T10:00:00.000Z'),
      },
      feedTitle: 'Feed',
      feedFaviconUrl: 'https://example.com/favicon.ico',
      isRead: false,
      isStarred: true,
      isArchived: false,
      rank: 0.8,
    }];
    const searchOffset = vi.fn().mockResolvedValue(rows);
    const searchLimit = vi.fn(() => ({ offset: searchOffset }));
    const searchOrderBy = vi.fn(() => ({ limit: searchLimit }));
    const searchWhere = vi.fn(() => ({ orderBy: searchOrderBy }));
    const searchLeftJoin = vi.fn(() => ({ where: searchWhere }));
    const searchInnerJoin = vi.fn(() => ({ leftJoin: searchLeftJoin }));
    const searchFrom = vi.fn(() => ({ innerJoin: searchInnerJoin }));

    const subscribedFeedsWhere = vi.fn().mockReturnValue('subscribed-feeds');
    const subscribedFeedsFrom = vi.fn(() => ({ where: subscribedFeedsWhere }));
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: subscribedFeedsFrom })
        .mockReturnValueOnce({ from: searchFrom }),
    } as never);

    const service = new ArticleService();
    await expect(service.search('user-1', {
      q: 'AI!!! future',
      page: 1,
      pageSize: 10,
    })).resolves.toEqual({
      items: [{
        id: 'article-1',
        title: 'Search hit',
        summary: 'Summary',
        contentHtml: 'safe:<p>Body</p>',
        imageUrl: 'img:https://example.com/image.jpg',
        createdAt: '2026-06-06T12:00:00.000Z',
        publishedAt: '2026-06-06T10:00:00.000Z',
        feedTitle: 'Feed',
        feedFaviconUrl: 'https://example.com/favicon.ico',
        isRead: false,
        isStarred: true,
        isArchived: false,
        tags: [],
      }],
      total: 1,
      page: 1,
      pageSize: 10,
      hasMore: false,
    });
  });

  it('maps null published dates during search results', async () => {
    const rows = [{
      article: {
        id: 'article-2',
        title: 'Search hit',
        summary: null,
        contentHtml: null,
        imageUrl: null,
        createdAt: new Date('2026-06-06T12:00:00.000Z'),
        publishedAt: null,
      },
      feedTitle: 'Feed',
      feedFaviconUrl: null,
      isRead: false,
      isStarred: false,
      isArchived: false,
      rank: 0.4,
    }];
    const searchOffset = vi.fn().mockResolvedValue(rows);
    const searchLimit = vi.fn(() => ({ offset: searchOffset }));
    const searchOrderBy = vi.fn(() => ({ limit: searchLimit }));
    const searchWhere = vi.fn(() => ({ orderBy: searchOrderBy }));
    const searchLeftJoin = vi.fn(() => ({ where: searchWhere }));
    const searchInnerJoin = vi.fn(() => ({ leftJoin: searchLeftJoin }));
    const searchFrom = vi.fn(() => ({ innerJoin: searchInnerJoin }));

    const subscribedFeedsWhere = vi.fn().mockReturnValue('subscribed-feeds');
    const subscribedFeedsFrom = vi.fn(() => ({ where: subscribedFeedsWhere }));
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: subscribedFeedsFrom })
        .mockReturnValueOnce({ from: searchFrom }),
    } as never);

    const service = new ArticleService();
    await expect(service.search('user-1', {
      q: 'AI',
      page: 1,
      pageSize: 10,
    })).resolves.toEqual({
      items: [{
        id: 'article-2',
        title: 'Search hit',
        summary: null,
        contentHtml: null,
        imageUrl: null,
        createdAt: '2026-06-06T12:00:00.000Z',
        publishedAt: null,
        feedTitle: 'Feed',
        feedFaviconUrl: null,
        isRead: false,
        isStarred: false,
        isArchived: false,
        tags: [],
      }],
      total: 1,
      page: 1,
      pageSize: 10,
      hasMore: false,
    });
  });
});
