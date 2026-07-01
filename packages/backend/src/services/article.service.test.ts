import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { articles } from '../db/schema/index.js';
import {
  sanitizeArticleDisplayHtml,
  sanitizeArticleImageUrl,
} from '../lib/html-sanitizer.js';
import { accessControlService } from './access-control.service.js';
import { ArticleService } from './article.service.js';

vi.mock('../db/client.js', () => ({
  getDb: vi.fn(),
}));

// Wrap the query-building operators in spies (still calling through) so tests
// can assert which conditions were applied to a query.
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: vi.fn(actual.eq),
    inArray: vi.fn(actual.inArray),
  };
});

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

// db.select(...).from().innerJoin().innerJoin().leftJoin().where().orderBy().limit().offset()
function buildListMainChain(rows: unknown[]) {
  const offset = vi.fn().mockResolvedValue(rows);
  const limit = vi.fn(() => ({ offset }));
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy }));
  const leftJoin = vi.fn(() => ({ where }));
  const secondInnerJoin = vi.fn(() => ({ leftJoin }));
  const firstInnerJoin = vi.fn(() => ({ innerJoin: secondInnerJoin }));
  const from = vi.fn(() => ({ innerJoin: firstInnerJoin }));
  return { from, where, orderBy };
}

// db.select({ count }).from().innerJoin().innerJoin().leftJoin().where() => [{ count }]
function buildCountChain(total: number) {
  const where = vi.fn().mockResolvedValue([{ count: total }]);
  const leftJoin = vi.fn(() => ({ where }));
  const secondInnerJoin = vi.fn(() => ({ leftJoin }));
  const firstInnerJoin = vi.fn(() => ({ innerJoin: secondInnerJoin }));
  const from = vi.fn(() => ({ innerJoin: firstInnerJoin }));
  return { from, where };
}

// db.selectDistinctOn(...).from().innerJoin().where().orderBy() => subquery placeholder
function buildDistinctOnChain(placeholder: unknown = 'representative-ids') {
  const orderBy = vi.fn(() => placeholder);
  const where = vi.fn(() => ({ orderBy }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  return { from, where, orderBy };
}

// db.select({ feedId }).from().where() => subquery placeholder
function buildSelectWhereChain(placeholder: unknown) {
  const where = vi.fn(() => placeholder);
  const from = vi.fn(() => ({ where }));
  return { from, where };
}

// db.select(...).from().innerJoin().leftJoin().where().orderBy().limit().offset()
function buildSearchMainChain(rows: unknown[]) {
  const offset = vi.fn().mockResolvedValue(rows);
  const limit = vi.fn(() => ({ offset }));
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy }));
  const leftJoin = vi.fn(() => ({ where }));
  const innerJoin = vi.fn(() => ({ leftJoin }));
  const from = vi.fn(() => ({ innerJoin }));
  return { from, where };
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
        title: 'Story &#8216;quoted&#8217;',
        summary: 'Summary &amp; context',
        contentHtml: '<p>Body</p>',
        imageUrl: 'https://example.com/image.jpg',
        createdAt,
        publishedAt,
      },
      feedTitle: 'Feed &amp; friends',
      feedFaviconUrl: 'https://example.com/favicon.ico',
      isRead: true,
      isStarred: false,
      isArchived: false,
    }];
    const mainChain = buildListMainChain(rows);
    const folderFeeds = buildSelectWhereChain('folder-feeds');
    const distinctOn = buildDistinctOnChain();

    const selectMock = vi.fn()
      .mockReturnValueOnce({ from: folderFeeds.from })
      .mockReturnValueOnce({ from: mainChain.from });
    const selectDistinctOnMock = vi.fn(() => ({ from: distinctOn.from }));

    vi.mocked(getDb).mockReturnValue({
      select: selectMock,
      selectDistinctOn: selectDistinctOnMock,
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
        title: 'Story ‘quoted’',
        summary: 'Summary & context',
        contentHtml: 'safe:<p>Body</p>',
        imageUrl: 'img:https://example.com/image.jpg',
        createdAt: '2026-06-06T12:00:00.000Z',
        publishedAt: '2026-06-06T10:00:00.000Z',
        feedTitle: 'Feed & friends',
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

    // Every filter is combined into a single where(and(...)); the duplicate-collapsing
    // subquery is built via selectDistinctOn and scoped to the requested feed/folder.
    expect(mainChain.where).toHaveBeenCalledTimes(1);
    expect(mainChain.orderBy).toHaveBeenCalledTimes(1);
    expect(selectDistinctOnMock).toHaveBeenCalledTimes(1);
    expect(distinctOn.where).toHaveBeenCalledTimes(1);
    expect(sanitizeArticleDisplayHtml).toHaveBeenCalledWith('<p>Body</p>', 'Summary &amp; context');
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
    const mainChain = buildListMainChain(rows);
    const countChain = buildCountChain(5);
    const distinctOn = buildDistinctOnChain();

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: mainChain.from })
        .mockReturnValueOnce({ from: countChain.from }),
      selectDistinctOn: vi.fn(() => ({ from: distinctOn.from })),
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
    // The count query reuses the same deduplicating conditions as the page query.
    expect(countChain.where).toHaveBeenCalledTimes(1);
  });

  it('applies the read=true filter branch when requested', async () => {
    const mainChain = buildListMainChain([]);
    const distinctOn = buildDistinctOnChain();

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({ from: mainChain.from }),
      selectDistinctOn: vi.fn(() => ({ from: distinctOn.from })),
    } as never);

    const service = new ArticleService();
    await service.list('user-1', {
      page: 1,
      pageSize: 10,
      sort: 'published_at',
      order: 'desc',
      isRead: true,
    });

    expect(mainChain.where).toHaveBeenCalledTimes(1);
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
    const limit = vi.fn().mockResolvedValue([{ id: 'article-1' }, { id: 'article-2' }]);
    const articleWhere = vi.fn(() => ({ limit }));
    const leftJoin = vi.fn(() => ({ where: articleWhere }));
    const articleFrom = vi.fn(() => ({ leftJoin }));
    const folderFeedsWhere = vi.fn().mockReturnValue('folder-feeds');
    const folderFeedsFrom = vi.fn(() => ({ where: folderFeedsWhere }));
    const subscribedFeedsWhere = vi.fn().mockReturnValue('subscribed-feeds');
    const subscribedFeedsFrom = vi.fn(() => ({ where: subscribedFeedsWhere }));
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: subscribedFeedsFrom })
        .mockReturnValueOnce({ from: folderFeedsFrom })
        .mockReturnValueOnce({ from: articleFrom }),
    } as never);
    vi.mocked(accessControlService.assertFeedSubscribed).mockResolvedValue(undefined);

    const service = new ArticleService();
    const markReadSpy = vi.spyOn(service, 'markRead').mockResolvedValue(undefined);

    await expect(service.markAllRead('user-1', {
      feedId: 'feed-1',
      folderId: 'folder-1',
    })).resolves.toBe(2);

    expect(accessControlService.assertFeedSubscribed).toHaveBeenCalledWith('user-1', 'feed-1');
    // The unread filter, feedId scope, and folderId scope must be combined into
    // a single .where() — calling .where() more than once would replace, not AND.
    expect(articleWhere).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith(articles.feedId, 'feed-1');
    expect(inArray).toHaveBeenCalledWith(articles.feedId, 'folder-feeds');
    expect(markReadSpy).toHaveBeenCalledWith('user-1', ['article-1', 'article-2']);
  });

  it('returns zero from markAllRead when there are no unread matches', async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const articleWhere = vi.fn(() => ({ limit }));
    const leftJoin = vi.fn(() => ({ where: articleWhere }));
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
    const distinctOn = buildDistinctOnChain();
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: subscribedFeedsFrom })
        .mockReturnValueOnce({ from: searchFrom }),
      selectDistinctOn: vi.fn(() => ({ from: distinctOn.from })),
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
    const distinctOn = buildDistinctOnChain();
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: subscribedFeedsFrom })
        .mockReturnValueOnce({ from: searchFrom }),
      selectDistinctOn: vi.fn(() => ({ from: distinctOn.from })),
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
