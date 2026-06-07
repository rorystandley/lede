import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../db/client.js';
import { accessControlService, ResourceNotFoundError } from './access-control.service.js';
import { tagService } from './tag.service.js';

vi.mock('../db/client.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('./access-control.service.js', async () => {
  const actual = await vi.importActual<typeof import('./access-control.service.js')>('./access-control.service.js');
  return {
    ...actual,
    accessControlService: {
      assertArticleAccessible: vi.fn(),
      assertTagsOwned: vi.fn(),
    },
  };
});

describe('tagService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates, updates, deletes, and lists tags', async () => {
    const createdAt = new Date('2026-06-06T12:00:00.000Z');
    const tagRow = {
      id: 'tag-1',
      userId: 'user-1',
      name: 'AI',
      color: '#f0f',
      createdAt,
    };
    const updatedRow = {
      ...tagRow,
      name: 'ML',
      color: null,
    };

    const insertReturning = vi.fn().mockResolvedValue([tagRow]);
    const insertValues = vi.fn(() => ({ returning: insertReturning }));
    const updateReturning = vi.fn().mockResolvedValue([updatedRow]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const orderBy = vi.fn().mockResolvedValue([{ tag: tagRow, articleCount: 3 }]);
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));

    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn(() => ({ values: insertValues })),
      update: vi.fn(() => ({ set: updateSet })),
      delete: vi.fn(() => ({ where: deleteWhere })),
      select: vi.fn(() => ({ from })),
    } as never);

    await expect(tagService.create('user-1', 'AI', '#f0f')).resolves.toEqual({
      id: 'tag-1',
      userId: 'user-1',
      name: 'AI',
      color: '#f0f',
      createdAt: createdAt.toISOString(),
    });
    await expect(tagService.update('user-1', 'tag-1', { name: 'ML', color: null })).resolves.toEqual({
      id: 'tag-1',
      userId: 'user-1',
      name: 'ML',
      color: null,
      createdAt: createdAt.toISOString(),
    });
    await expect(tagService.delete('user-1', 'tag-1')).resolves.toBeUndefined();
    await expect(tagService.listForUser('user-1')).resolves.toEqual([
      {
        id: 'tag-1',
        userId: 'user-1',
        name: 'AI',
        color: '#f0f',
        createdAt: createdAt.toISOString(),
        articleCount: 3,
      },
    ]);

    expect(accessControlService.assertTagsOwned).toHaveBeenCalledWith('user-1', ['tag-1']);
    expect(deleteWhere).toHaveBeenCalledTimes(2);
  });

  it('normalizes a missing tag color to null on create', async () => {
    const createdAt = new Date('2026-06-06T12:00:00.000Z');
    const insertReturning = vi.fn().mockResolvedValue([{
      id: 'tag-null-color',
      userId: 'user-1',
      name: 'Plain',
      color: null,
      createdAt,
    }]);
    const insertValues = vi.fn(() => ({ returning: insertReturning }));

    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn(() => ({ values: insertValues })),
    } as never);

    await expect(tagService.create('user-1', 'Plain')).resolves.toEqual({
      id: 'tag-null-color',
      userId: 'user-1',
      name: 'Plain',
      color: null,
      createdAt: createdAt.toISOString(),
    });

    expect(insertValues).toHaveBeenCalledWith({
      userId: 'user-1',
      name: 'Plain',
      color: null,
    });
  });

  it('throws when update cannot find the tag', async () => {
    const updateReturning = vi.fn().mockResolvedValue([]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));

    vi.mocked(getDb).mockReturnValue({
      update: vi.fn(() => ({ set: updateSet })),
    } as never);

    await expect(tagService.update('user-1', 'missing', { name: 'Nope' })).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it('replaces article tags and skips the insert step for an empty tag set', async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const insertValues = vi.fn().mockResolvedValue(undefined);

    vi.mocked(getDb).mockReturnValue({
      delete: vi.fn(() => ({ where: deleteWhere })),
      insert: vi.fn(() => ({ values: insertValues })),
    } as never);

    await expect(tagService.tagArticle('user-1', 'article-1', ['tag-1', 'tag-2'], 'ai')).resolves.toBeUndefined();
    await expect(tagService.tagArticle('user-1', 'article-1', [], 'manual')).resolves.toBeUndefined();

    expect(accessControlService.assertArticleAccessible).toHaveBeenCalledWith('user-1', 'article-1');
    expect(accessControlService.assertTagsOwned).toHaveBeenCalledWith('user-1', ['tag-1', 'tag-2']);
    expect(insertValues).toHaveBeenCalledWith([
      { userId: 'user-1', articleId: 'article-1', tagId: 'tag-1', source: 'ai' },
      { userId: 'user-1', articleId: 'article-1', tagId: 'tag-2', source: 'ai' },
    ]);
    expect(insertValues).toHaveBeenCalledTimes(1);
  });

  it('adds, removes, and reads article tags', async () => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const insertValues = vi.fn(() => ({ onConflictDoNothing }));
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const getWhere = vi.fn().mockResolvedValue([{ id: 'tag-1', name: 'AI', color: '#fff' }]);
    const innerJoin = vi.fn(() => ({ where: getWhere }));
    const from = vi.fn(() => ({ innerJoin }));

    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn(() => ({ values: insertValues })),
      delete: vi.fn(() => ({ where: deleteWhere })),
      select: vi.fn(() => ({ from })),
    } as never);

    await expect(tagService.addTagToArticle('user-1', 'article-1', 'tag-1')).resolves.toBeUndefined();
    await expect(tagService.removeTagFromArticle('user-1', 'article-1', 'tag-1')).resolves.toBeUndefined();
    await expect(tagService.getArticleTags('user-1', 'article-1')).resolves.toEqual([
      { id: 'tag-1', name: 'AI', color: '#fff' },
    ]);

    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });

  it('applies tags by name using existing and newly created tags', async () => {
    const existingTags = [
      {
        id: 'tag-1',
        userId: 'user-1',
        name: 'AI',
        color: '#111',
        createdAt: new Date('2026-06-06T10:00:00.000Z'),
      },
    ];
    const selectWhere = vi.fn().mockResolvedValue(existingTags);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const createReturning = vi.fn().mockResolvedValue([
      {
        id: 'tag-2',
        userId: 'user-1',
        name: 'ml',
        color: null,
        createdAt: new Date('2026-06-06T11:00:00.000Z'),
      },
    ]);
    const createValues = vi.fn(() => ({ returning: createReturning }));
    const linkOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const linkValues = vi.fn(() => ({ onConflictDoNothing: linkOnConflictDoNothing }));
    const insert = vi.fn()
      .mockReturnValueOnce({ values: createValues })
      .mockReturnValueOnce({ values: linkValues });

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from: selectFrom })),
      insert,
    } as never);

    await expect(
      tagService.applyTagsByName('user-1', 'article-1', [' AI ', 'ML', 'ml', ''], 'ai'),
    ).resolves.toEqual([
      {
        id: 'tag-1',
        userId: 'user-1',
        name: 'AI',
        color: '#111',
        createdAt: '2026-06-06T10:00:00.000Z',
      },
      {
        id: 'tag-2',
        userId: 'user-1',
        name: 'ml',
        color: null,
        createdAt: '2026-06-06T11:00:00.000Z',
      },
    ]);

    expect(createValues).toHaveBeenCalledWith({ userId: 'user-1', name: 'ml' });
    expect(linkValues).toHaveBeenCalledWith([
      { userId: 'user-1', articleId: 'article-1', tagId: 'tag-1', source: 'ai' },
      { userId: 'user-1', articleId: 'article-1', tagId: 'tag-2', source: 'ai' },
    ]);
  });

  it('returns early when applyTagsByName receives no usable names', async () => {
    vi.mocked(getDb).mockReturnValue({} as never);

    await expect(tagService.applyTagsByName('user-1', 'article-1', [' ', ''])).resolves.toEqual([]);
  });
});
