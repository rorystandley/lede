import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../db/client.js';
import { folderService } from './folder.service.js';

vi.mock('../db/client.js', () => ({
  getDb: vi.fn(),
}));

describe('folderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates and updates folders', async () => {
    const createdAt = new Date('2026-06-05T12:00:00.000Z');
    const updatedAt = new Date('2026-06-05T12:05:00.000Z');
    const createdRow = {
      id: 'folder-1',
      userId: 'user-1',
      name: 'Inbox',
      parentId: null,
      sortOrder: 0,
      createdAt,
      updatedAt,
    };
    const updatedRow = {
      ...createdRow,
      name: 'Renamed',
      parentId: 'parent-1',
      sortOrder: 3,
    };

    const insertReturning = vi.fn().mockResolvedValue([createdRow]);
    const insertValues = vi.fn(() => ({ returning: insertReturning }));
    const updateReturning = vi.fn().mockResolvedValue([updatedRow]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));

    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn(() => ({ values: insertValues })),
      update: vi.fn(() => ({ set: updateSet })),
    } as never);

    await expect(folderService.create('user-1', 'Inbox')).resolves.toEqual({
      id: 'folder-1',
      userId: 'user-1',
      name: 'Inbox',
      parentId: null,
      sortOrder: 0,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });

    await expect(
      folderService.update('user-1', 'folder-1', { name: 'Renamed', parentId: 'parent-1', sortOrder: 3 }),
    ).resolves.toEqual({
      id: 'folder-1',
      userId: 'user-1',
      name: 'Renamed',
      parentId: 'parent-1',
      sortOrder: 3,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });

    expect(insertValues).toHaveBeenCalledWith({
      userId: 'user-1',
      name: 'Inbox',
      parentId: null,
    });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Renamed',
        parentId: 'parent-1',
        sortOrder: 3,
        updatedAt: expect.any(Date),
      }),
    );
  });

  it('throws when updating a missing folder', async () => {
    const updateReturning = vi.fn().mockResolvedValue([]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));

    vi.mocked(getDb).mockReturnValue({
      update: vi.fn(() => ({ set: updateSet })),
    } as never);

    await expect(folderService.update('user-1', 'missing', { name: 'Nope' })).rejects.toThrow('Folder not found');
  });

  it('clears subscriptions before deleting a folder', async () => {
    const subscriptionWhere = vi.fn().mockResolvedValue(undefined);
    const subscriptionSet = vi.fn(() => ({ where: subscriptionWhere }));
    const folderDeleteWhere = vi.fn().mockResolvedValue(undefined);

    vi.mocked(getDb).mockReturnValue({
      update: vi.fn(() => ({ set: subscriptionSet })),
      delete: vi.fn(() => ({ where: folderDeleteWhere })),
    } as never);

    await expect(folderService.delete('user-1', 'folder-1')).resolves.toBeUndefined();
    expect(subscriptionSet).toHaveBeenCalledWith({ folderId: null });
    expect(subscriptionWhere).toHaveBeenCalled();
    expect(folderDeleteWhere).toHaveBeenCalled();
  });

  it('lists folders as a nested tree with counts', async () => {
    const orderBy = vi.fn().mockResolvedValue([
      {
        folder: {
          id: 'root-1',
          userId: 'user-1',
          name: 'Tech',
          parentId: null,
          sortOrder: 0,
          createdAt: new Date('2026-06-05T12:00:00.000Z'),
          updatedAt: new Date('2026-06-05T12:00:00.000Z'),
        },
        feedCount: 5,
        unreadCount: 11,
      },
      {
        folder: {
          id: 'child-1',
          userId: 'user-1',
          name: 'AI',
          parentId: 'root-1',
          sortOrder: 1,
          createdAt: new Date('2026-06-05T12:00:00.000Z'),
          updatedAt: new Date('2026-06-05T12:00:00.000Z'),
        },
        feedCount: 2,
        unreadCount: 4,
      },
      {
        folder: {
          id: 'orphan-1',
          userId: 'user-1',
          name: 'World',
          parentId: 'missing-parent',
          sortOrder: 2,
          createdAt: new Date('2026-06-05T12:00:00.000Z'),
          updatedAt: new Date('2026-06-05T12:00:00.000Z'),
        },
        feedCount: 1,
        unreadCount: 3,
      },
    ]);
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from })),
    } as never);

    await expect(folderService.listForUser('user-1')).resolves.toEqual([
      {
        id: 'root-1',
        userId: 'user-1',
        name: 'Tech',
        parentId: null,
        sortOrder: 0,
        createdAt: '2026-06-05T12:00:00.000Z',
        updatedAt: '2026-06-05T12:00:00.000Z',
        feedCount: 5,
        unreadCount: 11,
        children: [
          {
            id: 'child-1',
            userId: 'user-1',
            name: 'AI',
            parentId: 'root-1',
            sortOrder: 1,
            createdAt: '2026-06-05T12:00:00.000Z',
            updatedAt: '2026-06-05T12:00:00.000Z',
            feedCount: 2,
            unreadCount: 4,
            children: [],
          },
        ],
      },
      {
        id: 'orphan-1',
        userId: 'user-1',
        name: 'World',
        parentId: 'missing-parent',
        sortOrder: 2,
        createdAt: '2026-06-05T12:00:00.000Z',
        updatedAt: '2026-06-05T12:00:00.000Z',
        feedCount: 1,
        unreadCount: 3,
        children: [],
      },
    ]);
  });
});
