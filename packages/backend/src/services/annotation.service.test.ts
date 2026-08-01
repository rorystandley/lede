import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../db/client.js';
import { accessControlService } from './access-control.service.js';
import { annotationService } from './annotation.service.js';

vi.mock('../db/client.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('./access-control.service.js', async () => {
  const actual = await vi.importActual<typeof import('./access-control.service.js')>('./access-control.service.js');
  return {
    ...actual,
    accessControlService: {
      assertArticleAccessible: vi.fn(),
      assertAnnotationAccessible: vi.fn(),
    },
  };
});

describe('annotationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates annotations after validating article access', async () => {
    const insertReturning = vi.fn().mockResolvedValue([
      {
        id: 'annotation-1',
        userId: 'user-1',
        articleId: 'article-1',
        type: 'highlight',
        content: null,
        startOffset: 1,
        endOffset: 8,
        color: '#ffee00',
      },
    ]);
    const insertValues = vi.fn(() => ({ returning: insertReturning }));

    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn(() => ({ values: insertValues })),
    } as never);

    await expect(
      annotationService.create('user-1', 'article-1', {
        type: 'highlight',
        startOffset: 1,
        endOffset: 8,
        color: '#ffee00',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'annotation-1',
        type: 'highlight',
      }),
    );

    expect(accessControlService.assertArticleAccessible).toHaveBeenCalledWith('user-1', 'article-1');
    expect(insertValues).toHaveBeenCalledWith({
      userId: 'user-1',
      articleId: 'article-1',
      type: 'highlight',
      content: null,
      startOffset: 1,
      endOffset: 8,
      color: '#ffee00',
    });
  });

  it('normalizes missing optional annotation fields to null', async () => {
    const insertReturning = vi.fn().mockResolvedValue([
      {
        id: 'annotation-2',
        userId: 'user-1',
        articleId: 'article-2',
        type: 'note',
        content: null,
        startOffset: null,
        endOffset: null,
        color: null,
      },
    ]);
    const insertValues = vi.fn(() => ({ returning: insertReturning }));

    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn(() => ({ values: insertValues })),
    } as never);

    await expect(
      annotationService.create('user-1', 'article-2', {
        type: 'note',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'annotation-2',
        type: 'note',
      }),
    );

    expect(insertValues).toHaveBeenCalledWith({
      userId: 'user-1',
      articleId: 'article-2',
      type: 'note',
      content: null,
      startOffset: null,
      endOffset: null,
      color: null,
    });
  });

  it('lists article annotations in order', async () => {
    const orderBy = vi.fn().mockResolvedValue([{ id: 'annotation-1' }, { id: 'annotation-2' }]);
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from })),
    } as never);

    await expect(annotationService.listForArticle('user-1', 'article-1')).resolves.toEqual([
      { id: 'annotation-1' },
      { id: 'annotation-2' },
    ]);
    expect(accessControlService.assertArticleAccessible).toHaveBeenCalledWith('user-1', 'article-1');
  });

  it('updates and deletes annotations after validating ownership', async () => {
    const updateReturning = vi.fn().mockResolvedValue([{ id: 'annotation-1', content: 'Updated', color: '#333' }]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const deleteWhere = vi.fn().mockResolvedValue(undefined);

    vi.mocked(getDb).mockReturnValue({
      update: vi.fn(() => ({ set: updateSet })),
      delete: vi.fn(() => ({ where: deleteWhere })),
    } as never);

    await expect(
      annotationService.update('user-1', 'annotation-1', { content: 'Updated', color: '#333' }),
    ).resolves.toEqual({ id: 'annotation-1', content: 'Updated', color: '#333' });
    await expect(annotationService.delete('user-1', 'annotation-1')).resolves.toBeUndefined();

    expect(accessControlService.assertAnnotationAccessible).toHaveBeenCalledWith('user-1', 'annotation-1');
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Updated',
        color: '#333',
        updatedAt: expect.any(Date),
      }),
    );
    expect(deleteWhere).toHaveBeenCalled();
  });
});
