import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../db/client.js';
import { getLogger } from '../lib/logger.js';
import { digestsBuilt } from '../lib/metrics.js';
import { aiService } from './ai.service.js';
import { digestService } from './digest.service.js';

vi.mock('../db/client.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('../lib/logger.js', () => ({
  getLogger: vi.fn(),
}));

vi.mock('../lib/metrics.js', () => ({
  digestsBuilt: {
    inc: vi.fn(),
  },
}));

vi.mock('./ai.service.js', () => ({
  aiService: {
    generateBriefing: vi.fn(),
  },
}));

describe('digestService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLogger).mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
    } as never);
  });

  it('builds a digest, groups articles, and stores article links', async () => {
    vi.setSystemTime(new Date('2026-06-06T12:00:00.000Z'));

    const lastDigestLimit = vi.fn().mockResolvedValue([]);
    const lastDigestOrderBy = vi.fn(() => ({ limit: lastDigestLimit }));
    const lastDigestWhere = vi.fn(() => ({ orderBy: lastDigestOrderBy }));
    const lastDigestFrom = vi.fn(() => ({ where: lastDigestWhere }));

    const unreadArticlesLimit = vi.fn().mockResolvedValue([
      {
        article: {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'AI roundup',
          url: 'https://example.com/ai',
          publishedAt: new Date('2026-06-06T10:00:00.000Z'),
          summary: 'A'.repeat(400),
          wordCount: 500,
        },
        feedTitle: 'Tech Daily',
        feedFaviconUrl: null,
        folderName: 'Tech',
        folderId: 'folder-1',
      },
      {
        article: {
          id: 'article-2',
          feedId: 'feed-2',
          title: null,
          url: 'https://example.com/world',
          publishedAt: null,
          summary: null,
          wordCount: 120,
        },
        feedTitle: 'World Wire',
        feedFaviconUrl: null,
        folderName: null,
        folderId: null,
      },
    ]);
    const unreadArticlesOrderBy = vi.fn(() => ({ limit: unreadArticlesLimit }));
    const unreadArticlesWhere = vi.fn(() => ({ orderBy: unreadArticlesOrderBy }));
    const unreadArticlesLeftJoin2 = vi.fn(() => ({ where: unreadArticlesWhere }));
    const unreadArticlesLeftJoin1 = vi.fn(() => ({ leftJoin: unreadArticlesLeftJoin2 }));
    const unreadArticlesInnerJoin2 = vi.fn(() => ({ leftJoin: unreadArticlesLeftJoin1 }));
    const unreadArticlesInnerJoin1 = vi.fn(() => ({ innerJoin: unreadArticlesInnerJoin2 }));
    const unreadArticlesFrom = vi.fn(() => ({ innerJoin: unreadArticlesInnerJoin1 }));

    const digestRow = {
      id: 'digest-1',
      userId: 'user-1',
      scheduledFor: new Date('2026-06-06T12:00:00.000Z'),
      deliveredAt: null,
      articleCount: 2,
      status: 'ready',
      contentJson: {
        date: '2026-06-06',
        briefing: 'Briefing text',
        sections: [],
        stats: { totalArticles: 2, estimatedReadTimeMin: 4 },
      },
      createdAt: new Date('2026-06-06T12:00:00.000Z'),
    };
    const digestInsertReturning = vi.fn().mockResolvedValue([digestRow]);
    const digestInsertValues = vi.fn(() => ({ returning: digestInsertReturning }));
    const digestArticleValues = vi.fn().mockResolvedValue(undefined);
    const insert = vi
      .fn()
      .mockReturnValueOnce({ values: digestInsertValues })
      .mockReturnValue({ values: digestArticleValues });
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: lastDigestFrom })
      .mockReturnValueOnce({ from: unreadArticlesFrom });

    const logger = { info: vi.fn(), warn: vi.fn() };
    vi.mocked(getLogger).mockReturnValue(logger as never);
    vi.mocked(getDb).mockReturnValue({
      select,
      insert,
    } as never);
    vi.mocked(aiService.generateBriefing).mockResolvedValue('Briefing text');

    await expect(digestService.buildDigest('user-1')).resolves.toEqual({
      id: 'digest-1',
      userId: 'user-1',
      scheduledFor: '2026-06-06T12:00:00.000Z',
      deliveredAt: null,
      articleCount: 2,
      status: 'ready',
      content: digestRow.contentJson,
      createdAt: '2026-06-06T12:00:00.000Z',
    });

    expect(aiService.generateBriefing).toHaveBeenCalledWith('user-1', [
      { title: 'AI roundup', summary: 'A'.repeat(300) },
      { title: 'Untitled', summary: '' },
    ]);
    expect(digestInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        articleCount: 2,
        status: 'ready',
        contentJson: {
          date: '2026-06-06',
          briefing: 'Briefing text',
          sections: [
            {
              folder: 'Tech',
              feeds: [
                {
                  feedId: 'feed-1',
                  feedTitle: 'Tech Daily',
                  articles: [
                    expect.objectContaining({
                      id: 'article-1',
                      summary: 'A'.repeat(300),
                    }),
                  ],
                },
              ],
            },
            {
              folder: null,
              feeds: [
                {
                  feedId: 'feed-2',
                  feedTitle: 'World Wire',
                  articles: [
                    expect.objectContaining({
                      id: 'article-2',
                      title: null,
                    }),
                  ],
                },
              ],
            },
          ],
          stats: {
            totalArticles: 2,
            estimatedReadTimeMin: 4,
          },
        },
      }),
    );
    expect(digestArticleValues).toHaveBeenNthCalledWith(1, {
      digestId: 'digest-1',
      articleId: 'article-1',
      sortOrder: 0,
    });
    expect(digestArticleValues).toHaveBeenNthCalledWith(2, {
      digestId: 'digest-1',
      articleId: 'article-2',
      sortOrder: 1,
    });
    expect(logger.info).toHaveBeenCalledWith(
      { userId: 'user-1', articleCount: 2, digestId: 'digest-1' },
      'Digest built',
    );
    expect(digestsBuilt.inc).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('skips briefing generation failures and handles empty unread sets', async () => {
    vi.setSystemTime(new Date('2026-06-06T12:00:00.000Z'));

    const latestDigestLimit = vi.fn().mockResolvedValue([{ createdAt: new Date('2026-06-06T09:00:00.000Z') }]);
    const latestDigestOrderBy = vi.fn(() => ({ limit: latestDigestLimit }));
    const latestDigestWhere = vi.fn(() => ({ orderBy: latestDigestOrderBy }));
    const latestDigestFrom = vi.fn(() => ({ where: latestDigestWhere }));

    const unreadArticlesLimit = vi.fn().mockResolvedValue([]);
    const unreadArticlesOrderBy = vi.fn(() => ({ limit: unreadArticlesLimit }));
    const unreadArticlesWhere = vi.fn(() => ({ orderBy: unreadArticlesOrderBy }));
    const unreadArticlesLeftJoin2 = vi.fn(() => ({ where: unreadArticlesWhere }));
    const unreadArticlesLeftJoin1 = vi.fn(() => ({ leftJoin: unreadArticlesLeftJoin2 }));
    const unreadArticlesInnerJoin2 = vi.fn(() => ({ leftJoin: unreadArticlesLeftJoin1 }));
    const unreadArticlesInnerJoin1 = vi.fn(() => ({ innerJoin: unreadArticlesInnerJoin2 }));
    const unreadArticlesFrom = vi.fn(() => ({ innerJoin: unreadArticlesInnerJoin1 }));

    const digestInsertReturning = vi.fn().mockResolvedValue([
      {
        id: 'digest-2',
        userId: 'user-1',
        scheduledFor: new Date('2026-06-06T12:00:00.000Z'),
        deliveredAt: null,
        articleCount: 0,
        status: 'ready',
        contentJson: null,
        createdAt: new Date('2026-06-06T12:00:00.000Z'),
      },
    ]);
    const digestInsertValues = vi.fn(() => ({ returning: digestInsertReturning }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: latestDigestFrom })
      .mockReturnValueOnce({ from: unreadArticlesFrom });
    const logger = { info: vi.fn(), warn: vi.fn() };

    vi.mocked(getLogger).mockReturnValue(logger as never);
    vi.mocked(getDb).mockReturnValue({
      select,
      insert: vi.fn(() => ({ values: digestInsertValues })),
    } as never);
    vi.mocked(aiService.generateBriefing).mockRejectedValue(new Error('should not run'));

    await digestService.buildDigest('user-1');

    expect(aiService.generateBriefing).not.toHaveBeenCalled();
    expect(digestInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        articleCount: 0,
        contentJson: {
          date: '2026-06-06',
          briefing: null,
          sections: [],
          stats: {
            totalArticles: 0,
            estimatedReadTimeMin: 0,
          },
        },
      }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('logs AI briefing failures and continues building', async () => {
    vi.setSystemTime(new Date('2026-06-06T12:00:00.000Z'));

    const lastDigestLimit = vi.fn().mockResolvedValue([]);
    const lastDigestOrderBy = vi.fn(() => ({ limit: lastDigestLimit }));
    const lastDigestWhere = vi.fn(() => ({ orderBy: lastDigestOrderBy }));
    const lastDigestFrom = vi.fn(() => ({ where: lastDigestWhere }));

    const unreadArticlesLimit = vi.fn().mockResolvedValue([
      {
        article: {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'AI roundup',
          url: 'https://example.com/ai',
          publishedAt: new Date('2026-06-06T10:00:00.000Z'),
          summary: 'Summary',
          wordCount: 200,
        },
        feedTitle: 'Tech Daily',
        feedFaviconUrl: null,
        folderName: null,
        folderId: null,
      },
    ]);
    const unreadArticlesOrderBy = vi.fn(() => ({ limit: unreadArticlesLimit }));
    const unreadArticlesWhere = vi.fn(() => ({ orderBy: unreadArticlesOrderBy }));
    const unreadArticlesLeftJoin2 = vi.fn(() => ({ where: unreadArticlesWhere }));
    const unreadArticlesLeftJoin1 = vi.fn(() => ({ leftJoin: unreadArticlesLeftJoin2 }));
    const unreadArticlesInnerJoin2 = vi.fn(() => ({ leftJoin: unreadArticlesLeftJoin1 }));
    const unreadArticlesInnerJoin1 = vi.fn(() => ({ innerJoin: unreadArticlesInnerJoin2 }));
    const unreadArticlesFrom = vi.fn(() => ({ innerJoin: unreadArticlesInnerJoin1 }));

    const digestInsertReturning = vi.fn().mockResolvedValue([
      {
        id: 'digest-3',
        userId: 'user-1',
        scheduledFor: new Date('2026-06-06T12:00:00.000Z'),
        deliveredAt: null,
        articleCount: 1,
        status: 'ready',
        contentJson: null,
        createdAt: new Date('2026-06-06T12:00:00.000Z'),
      },
    ]);
    const digestInsertValues = vi.fn(() => ({ returning: digestInsertReturning }));
    const logger = { info: vi.fn(), warn: vi.fn() };

    vi.mocked(getLogger).mockReturnValue(logger as never);
    vi.mocked(getDb).mockReturnValue({
      select: vi
        .fn()
        .mockReturnValueOnce({ from: lastDigestFrom })
        .mockReturnValueOnce({ from: unreadArticlesFrom }),
      insert: vi.fn(() => ({ values: digestInsertValues })),
    } as never);
    vi.mocked(aiService.generateBriefing).mockRejectedValue(new Error('AI unavailable'));

    await digestService.buildDigest('user-1');

    expect(logger.warn).toHaveBeenCalledWith(
      { userId: 'user-1', error: expect.any(Error) },
      'AI briefing generation failed, skipping',
    );
    expect(digestInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        contentJson: expect.objectContaining({
          briefing: null,
        }),
      }),
    );
    vi.useRealTimers();
  });

  it('returns, updates, and lists digests and delivery users', async () => {
    const routeEq = vi.fn();
    const latestLimit = vi.fn().mockResolvedValue([
      {
        id: 'digest-1',
        userId: 'user-1',
        scheduledFor: new Date('2026-06-06T12:00:00.000Z'),
        deliveredAt: new Date('2026-06-06T13:00:00.000Z'),
        articleCount: 4,
        status: 'delivered',
        contentJson: { sections: [] },
        createdAt: new Date('2026-06-06T12:00:00.000Z'),
      },
    ]);
    const latestOrderBy = vi.fn(() => ({ limit: latestLimit }));
    const latestWhere = vi.fn(() => ({ orderBy: latestOrderBy }));
    const latestFrom = vi.fn(() => ({ where: latestWhere }));

    const listLimit = vi.fn().mockResolvedValue([
      {
        id: 'digest-2',
        userId: 'user-1',
        scheduledFor: new Date('2026-06-05T12:00:00.000Z'),
        deliveredAt: null,
        articleCount: 1,
        status: 'ready',
        contentJson: null,
        createdAt: new Date('2026-06-05T12:00:00.000Z'),
      },
    ]);
    const listOrderBy = vi.fn(() => ({ limit: listLimit }));
    const listWhere = vi.fn(() => ({ orderBy: listOrderBy }));
    const listFrom = vi.fn(() => ({ where: listWhere }));

    const usersWhere = vi.fn().mockResolvedValue([
      {
        id: 'user-1',
        timezone: 'UTC',
        digestSchedule: '08:00',
        email: 'reader@example.com',
        displayName: 'Reader',
        digestEmail: true,
        digestPush: false,
      },
    ]);
    const usersFrom = vi.fn(() => ({ where: usersWhere }));

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));

    vi.mocked(getDb).mockReturnValue({
      select: vi
        .fn()
        .mockReturnValueOnce({ from: latestFrom })
        .mockReturnValueOnce({ from: listFrom })
        .mockReturnValueOnce({ from: usersFrom }),
      update: vi.fn(() => ({ set: updateSet })),
      query: {
        users: {
          findFirst: vi
            .fn()
            .mockImplementationOnce(async ({ where }) => {
              where({ id: 'users.id' }, { eq: routeEq });
              return {
                email: 'reader@example.com',
                displayName: 'Reader',
                digestEmail: true,
                digestPush: false,
              };
            })
            .mockImplementationOnce(async ({ where }) => {
              where({ id: 'users.id' }, { eq: routeEq });
              return null;
            }),
        },
      },
    } as never);

    await expect(digestService.getLatest('user-1')).resolves.toEqual({
      id: 'digest-1',
      userId: 'user-1',
      scheduledFor: '2026-06-06T12:00:00.000Z',
      deliveredAt: '2026-06-06T13:00:00.000Z',
      articleCount: 4,
      status: 'delivered',
      content: { sections: [] },
      createdAt: '2026-06-06T12:00:00.000Z',
    });
    await expect(digestService.listForUser('user-1', 5)).resolves.toEqual([
      {
        id: 'digest-2',
        userId: 'user-1',
        scheduledFor: '2026-06-05T12:00:00.000Z',
        deliveredAt: null,
        articleCount: 1,
        status: 'ready',
        content: null,
        createdAt: '2026-06-05T12:00:00.000Z',
      },
    ]);
    await expect(digestService.getUsersForDigest()).resolves.toEqual([
      {
        id: 'user-1',
        timezone: 'UTC',
        digestSchedule: '08:00',
        email: 'reader@example.com',
        displayName: 'Reader',
        digestEmail: true,
        digestPush: false,
      },
    ]);
    await expect(digestService.getUserForDelivery('user-1')).resolves.toEqual({
      email: 'reader@example.com',
      displayName: 'Reader',
      digestEmail: true,
      digestPush: false,
    });
    await expect(digestService.getUserForDelivery('missing')).resolves.toBeNull();
    await expect(digestService.markDelivered('user-1', 'digest-1')).resolves.toBeUndefined();

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveredAt: expect.any(Date),
        status: 'delivered',
      }),
    );
    expect(routeEq).toHaveBeenCalledWith('users.id', 'user-1');
    expect(routeEq).toHaveBeenCalledWith('users.id', 'missing');
    expect(updateWhere).toHaveBeenCalled();
  });

  it('returns null when no latest digest exists', async () => {
    const latestLimit = vi.fn().mockResolvedValue([]);
    const latestOrderBy = vi.fn(() => ({ limit: latestLimit }));
    const latestWhere = vi.fn(() => ({ orderBy: latestOrderBy }));
    const latestFrom = vi.fn(() => ({ where: latestWhere }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from: latestFrom })),
    } as never);

    await expect(digestService.getLatest('user-2')).resolves.toBeNull();
  });
});
