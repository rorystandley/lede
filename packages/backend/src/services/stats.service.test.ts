import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../db/client.js';
import { statsService } from './stats.service.js';

vi.mock('../db/client.js', () => ({
  getDb: vi.fn(),
}));

describe('statsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records article reads with an upsert', async () => {
    vi.setSystemTime(new Date('2026-06-06T10:00:00.000Z'));
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const insertValues = vi.fn(() => ({ onConflictDoUpdate }));

    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn(() => ({ values: insertValues })),
    } as never);

    await expect(statsService.recordArticleRead('user-1', 'article-1', 2500)).resolves.toBeUndefined();

    expect(insertValues).toHaveBeenCalledWith({
      userId: 'user-1',
      date: '2026-06-06',
      articlesRead: 1,
      totalTimeMs: 2500,
    });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.any(Array),
        set: expect.objectContaining({
          articlesRead: expect.anything(),
          totalTimeMs: expect.anything(),
        }),
      }),
    );
    vi.useRealTimers();
  });

  it('returns daily stats ordered from newest to oldest', async () => {
    vi.setSystemTime(new Date('2026-06-06T10:00:00.000Z'));
    const statsRows = [
      { userId: 'user-1', date: '2026-06-06', articlesRead: 3, totalTimeMs: 120000 },
      { userId: 'user-1', date: '2026-06-05', articlesRead: 1, totalTimeMs: 30000 },
    ];
    const orderBy = vi.fn().mockResolvedValue(statsRows);
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from })),
    } as never);

    await expect(statsService.getDailyStats('user-1', 14)).resolves.toEqual(statsRows);
    expect(orderBy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('builds a summary from aggregate queries', async () => {
    vi.setSystemTime(new Date('2026-06-06T10:00:00.000Z'));

    const totalReadWhere = vi.fn().mockResolvedValue([{ count: 9 }]);
    const totalReadFrom = vi.fn(() => ({ where: totalReadWhere }));
    const totalStarredWhere = vi.fn().mockResolvedValue([{ count: 4 }]);
    const totalStarredFrom = vi.fn(() => ({ where: totalStarredWhere }));
    const totalFeedsWhere = vi.fn().mockResolvedValue([{ count: 7 }]);
    const totalFeedsFrom = vi.fn(() => ({ where: totalFeedsWhere }));
    const weeklyWhere = vi.fn().mockResolvedValue([{ totalArticles: 12, totalTimeMs: 185000 }]);
    const weeklyFrom = vi.fn(() => ({ where: weeklyWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: totalReadFrom })
      .mockReturnValueOnce({ from: totalStarredFrom })
      .mockReturnValueOnce({ from: totalFeedsFrom })
      .mockReturnValueOnce({ from: weeklyFrom });

    vi.mocked(getDb).mockReturnValue({ select } as never);

    await expect(statsService.getSummary('user-1')).resolves.toEqual({
      totalArticlesRead: 9,
      totalStarred: 4,
      totalFeeds: 7,
      weeklyArticlesRead: 12,
      weeklyReadingTimeMin: 3,
    });

    expect(select).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it('falls back to zero weekly aggregates when no weekly stats are returned', async () => {
    vi.setSystemTime(new Date('2026-06-06T10:00:00.000Z'));

    const totalReadWhere = vi.fn().mockResolvedValue([{ count: 2 }]);
    const totalReadFrom = vi.fn(() => ({ where: totalReadWhere }));
    const totalStarredWhere = vi.fn().mockResolvedValue([{ count: 1 }]);
    const totalStarredFrom = vi.fn(() => ({ where: totalStarredWhere }));
    const totalFeedsWhere = vi.fn().mockResolvedValue([{ count: 5 }]);
    const totalFeedsFrom = vi.fn(() => ({ where: totalFeedsWhere }));
    const weeklyWhere = vi.fn().mockResolvedValue([]);
    const weeklyFrom = vi.fn(() => ({ where: weeklyWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: totalReadFrom })
      .mockReturnValueOnce({ from: totalStarredFrom })
      .mockReturnValueOnce({ from: totalFeedsFrom })
      .mockReturnValueOnce({ from: weeklyFrom });

    vi.mocked(getDb).mockReturnValue({ select } as never);

    await expect(statsService.getSummary('user-2')).resolves.toEqual({
      totalArticlesRead: 2,
      totalStarred: 1,
      totalFeeds: 5,
      weeklyArticlesRead: 0,
      weeklyReadingTimeMin: 0,
    });

    vi.useRealTimers();
  });
});
