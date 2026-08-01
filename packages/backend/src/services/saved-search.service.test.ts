import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../db/client.js';
import { articleService } from './article.service.js';
import { getLogger } from '../lib/logger.js';
import { savedSearchService } from './saved-search.service.js';

vi.mock('../db/client.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('./article.service.js', () => ({
  articleService: {
    search: vi.fn(),
  },
}));

vi.mock('../lib/logger.js', () => ({
  getLogger: vi.fn(),
}));

describe('savedSearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLogger).mockReturnValue({ error: vi.fn() } as never);
  });

  it('creates, updates, deletes, and lists saved searches', async () => {
    const baseRow = {
      id: 'search-1',
      userId: 'user-1',
      name: 'AI',
      query: 'ai',
      filters: { feedIds: ['feed-1'] },
      isMonitor: true,
      lastCheckedAt: new Date('2026-06-05T11:00:00.000Z'),
      createdAt: new Date('2026-06-05T10:00:00.000Z'),
      updatedAt: new Date('2026-06-05T12:00:00.000Z'),
    };

    const insertReturning = vi.fn().mockResolvedValue([baseRow]);
    const insertValues = vi.fn(() => ({ returning: insertReturning }));
    const updateReturning = vi.fn().mockResolvedValue([{ ...baseRow, name: 'ML', filters: null, isMonitor: false }]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const orderBy = vi.fn().mockResolvedValue([baseRow]);
    const listWhere = vi.fn(() => ({ orderBy }));
    const listFrom = vi.fn(() => ({ where: listWhere }));

    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn(() => ({ values: insertValues })),
      update: vi.fn(() => ({ set: updateSet })),
      delete: vi.fn(() => ({ where: deleteWhere })),
      select: vi.fn(() => ({ from: listFrom })),
    } as never);

    await expect(
      savedSearchService.create('user-1', {
        name: 'AI',
        query: 'ai',
        filters: { feedIds: ['feed-1'] },
        isMonitor: true,
      }),
    ).resolves.toEqual({
      id: 'search-1',
      userId: 'user-1',
      name: 'AI',
      query: 'ai',
      filters: { feedIds: ['feed-1'] },
      isMonitor: true,
      lastCheckedAt: '2026-06-05T11:00:00.000Z',
      createdAt: '2026-06-05T10:00:00.000Z',
      updatedAt: '2026-06-05T12:00:00.000Z',
    });

    await expect(
      savedSearchService.update('user-1', 'search-1', {
        name: 'ML',
        filters: null,
        isMonitor: false,
      }),
    ).resolves.toEqual({
      id: 'search-1',
      userId: 'user-1',
      name: 'ML',
      query: 'ai',
      filters: null,
      isMonitor: false,
      lastCheckedAt: '2026-06-05T11:00:00.000Z',
      createdAt: '2026-06-05T10:00:00.000Z',
      updatedAt: '2026-06-05T12:00:00.000Z',
    });

    await expect(savedSearchService.delete('user-1', 'search-1')).resolves.toBeUndefined();
    await expect(savedSearchService.listForUser('user-1')).resolves.toEqual([
      {
        id: 'search-1',
        userId: 'user-1',
        name: 'AI',
        query: 'ai',
        filters: { feedIds: ['feed-1'] },
        isMonitor: true,
        lastCheckedAt: '2026-06-05T11:00:00.000Z',
        createdAt: '2026-06-05T10:00:00.000Z',
        updatedAt: '2026-06-05T12:00:00.000Z',
      },
    ]);

    expect(insertValues).toHaveBeenCalledWith({
      userId: 'user-1',
      name: 'AI',
      query: 'ai',
      filters: { feedIds: ['feed-1'] },
      isMonitor: true,
    });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ML',
        filters: null,
        isMonitor: false,
        updatedAt: expect.any(Date),
      }),
    );
    expect(deleteWhere).toHaveBeenCalled();
  });

  it('throws when updating a missing saved search', async () => {
    const updateReturning = vi.fn().mockResolvedValue([]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));

    vi.mocked(getDb).mockReturnValue({
      update: vi.fn(() => ({ set: updateSet })),
    } as never);

    await expect(savedSearchService.update('user-1', 'missing', { name: 'Nope' })).rejects.toThrow(
      'Saved search not found',
    );
  });

  it('checks monitors, returns new counts, and logs failures', async () => {
    vi.setSystemTime(new Date('2026-06-06T12:00:00.000Z'));
    const monitors = [
      {
        id: 'search-1',
        userId: 'user-1',
        query: 'ai',
        filters: {
          feedIds: ['feed-1'],
          folderIds: ['folder-1'],
          tagIds: ['tag-1'],
          dateFrom: '2026-06-01T00:00:00.000Z',
          dateTo: '2026-06-30T00:00:00.000Z',
        },
        lastCheckedAt: new Date('2026-06-05T11:00:00.000Z'),
      },
      {
        id: 'search-2',
        userId: 'user-2',
        query: 'ml',
        filters: null,
        lastCheckedAt: null,
      },
      {
        id: 'search-3',
        userId: 'user-3',
        query: 'ops',
        filters: null,
        lastCheckedAt: null,
      },
    ];
    const monitorWhere = vi.fn().mockResolvedValue(monitors);
    const selectFrom = vi.fn(() => ({ where: monitorWhere }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const logger = { error: vi.fn() };

    vi.mocked(getLogger).mockReturnValue(logger as never);
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: updateSet })),
    } as never);
    vi.mocked(articleService.search)
      .mockResolvedValueOnce({ items: [{ id: 'a-1' }, { id: 'a-2' }] } as never)
      .mockResolvedValueOnce({ items: [] } as never)
      .mockRejectedValueOnce(new Error('Search failed'));

    await expect(savedSearchService.checkMonitors()).resolves.toEqual([
      {
        searchId: 'search-1',
        userId: 'user-1',
        newCount: 2,
      },
    ]);

    expect(articleService.search).toHaveBeenNthCalledWith(1, 'user-1', {
      q: 'ai',
      feedId: 'feed-1',
      folderId: 'folder-1',
      tagId: 'tag-1',
      dateFrom: '2026-06-05T11:00:00.000Z',
      dateTo: '2026-06-30T00:00:00.000Z',
      page: 1,
      pageSize: 100,
    });
    expect(articleService.search).toHaveBeenNthCalledWith(2, 'user-2', {
      q: 'ml',
      feedId: undefined,
      folderId: undefined,
      tagId: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      page: 1,
      pageSize: 100,
    });
    expect(updateSet).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error), searchId: 'search-3' },
      'Failed to check monitor',
    );
    vi.useRealTimers();
  });

  it('falls back to the saved filter date when a monitor has never been checked', async () => {
    vi.setSystemTime(new Date('2026-06-06T12:00:00.000Z'));
    const monitors = [{
      id: 'search-4',
      userId: 'user-4',
      query: 'security',
      filters: {
        dateFrom: '2026-06-01T00:00:00.000Z',
      },
      lastCheckedAt: null,
    }];
    const monitorWhere = vi.fn().mockResolvedValue(monitors);
    const selectFrom = vi.fn(() => ({ where: monitorWhere }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: updateSet })),
    } as never);
    vi.mocked(articleService.search).mockResolvedValue({ items: [] } as never);

    await expect(savedSearchService.checkMonitors()).resolves.toEqual([]);

    expect(articleService.search).toHaveBeenCalledWith('user-4', {
      q: 'security',
      feedId: undefined,
      folderId: undefined,
      tagId: undefined,
      dateFrom: '2026-06-01T00:00:00.000Z',
      dateTo: undefined,
      page: 1,
      pageSize: 100,
    });
    vi.useRealTimers();
  });

  it('uses default create values and serializes null lastCheckedAt', async () => {
    const row = {
      id: 'search-2',
      userId: 'user-1',
      name: 'Default Search',
      query: 'ops',
      filters: null,
      isMonitor: false,
      lastCheckedAt: null,
      createdAt: new Date('2026-06-05T10:00:00.000Z'),
      updatedAt: new Date('2026-06-05T12:00:00.000Z'),
    };

    const insertReturning = vi.fn().mockResolvedValue([row]);
    const insertValues = vi.fn(() => ({ returning: insertReturning }));
    const orderBy = vi.fn().mockResolvedValue([row]);
    const listWhere = vi.fn(() => ({ orderBy }));
    const listFrom = vi.fn(() => ({ where: listWhere }));

    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn(() => ({ values: insertValues })),
      select: vi.fn(() => ({ from: listFrom })),
    } as never);

    await expect(
      savedSearchService.create('user-1', {
        name: 'Default Search',
        query: 'ops',
      }),
    ).resolves.toEqual({
      id: 'search-2',
      userId: 'user-1',
      name: 'Default Search',
      query: 'ops',
      filters: null,
      isMonitor: false,
      lastCheckedAt: null,
      createdAt: '2026-06-05T10:00:00.000Z',
      updatedAt: '2026-06-05T12:00:00.000Z',
    });

    await expect(savedSearchService.listForUser('user-1')).resolves.toEqual([
      {
        id: 'search-2',
        userId: 'user-1',
        name: 'Default Search',
        query: 'ops',
        filters: null,
        isMonitor: false,
        lastCheckedAt: null,
        createdAt: '2026-06-05T10:00:00.000Z',
        updatedAt: '2026-06-05T12:00:00.000Z',
      },
    ]);

    expect(insertValues).toHaveBeenCalledWith({
      userId: 'user-1',
      name: 'Default Search',
      query: 'ops',
      filters: null,
      isMonitor: false,
    });
  });
});
