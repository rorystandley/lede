import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../db/client.js';
import {
  accessControlService,
  ResourceNotFoundError,
} from './access-control.service.js';

vi.mock('../db/client.js', () => ({
  getDb: vi.fn(),
}));

describe('accessControlService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists subscribed feed ids', async () => {
    const where = vi.fn().mockResolvedValue([{ feedId: 'feed-1' }, { feedId: 'feed-2' }]);
    const from = vi.fn(() => ({ where }));
    vi.mocked(getDb).mockReturnValue({ select: vi.fn(() => ({ from })) } as never);

    await expect(accessControlService.listSubscribedFeedIds('user-1')).resolves.toEqual(['feed-1', 'feed-2']);
  });

  it('accepts subscribed feeds and rejects missing ones', async () => {
    const subscribedLimit = vi.fn().mockResolvedValue([{ id: 'sub-1' }]);
    const subscribedWhere = vi.fn(() => ({ limit: subscribedLimit }));
    const subscribedFrom = vi.fn(() => ({ where: subscribedWhere }));
    vi.mocked(getDb).mockReturnValue({ select: vi.fn(() => ({ from: subscribedFrom })) } as never);

    await expect(accessControlService.assertFeedSubscribed('user-1', 'feed-1')).resolves.toBeUndefined();

    const missingLimit = vi.fn().mockResolvedValue([]);
    const missingWhere = vi.fn(() => ({ limit: missingLimit }));
    const missingFrom = vi.fn(() => ({ where: missingWhere }));
    vi.mocked(getDb).mockReturnValue({ select: vi.fn(() => ({ from: missingFrom })) } as never);

    await expect(accessControlService.assertFeedSubscribed('user-1', 'feed-2')).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it('returns accessible articles and validates single article access', async () => {
    const accessibleLimit = vi.fn().mockResolvedValue([{ article: { id: 'article-1', feedId: 'feed-1' } }]);
    const accessibleWhere = vi.fn(() => ({ limit: accessibleLimit }));
    const accessibleJoin = vi.fn(() => ({ where: accessibleWhere }));
    const accessibleFrom = vi.fn(() => ({ innerJoin: accessibleJoin }));
    vi.mocked(getDb).mockReturnValue({ select: vi.fn(() => ({ from: accessibleFrom })) } as never);

    await expect(accessControlService.getAccessibleArticle('user-1', 'article-1')).resolves.toEqual({
      id: 'article-1',
      feedId: 'feed-1',
    });
    await expect(accessControlService.assertArticleAccessible('user-1', 'article-1')).resolves.toBeUndefined();

    const missingLimit = vi.fn().mockResolvedValue([]);
    const missingWhere = vi.fn(() => ({ limit: missingLimit }));
    const missingJoin = vi.fn(() => ({ where: missingWhere }));
    const missingFrom = vi.fn(() => ({ innerJoin: missingJoin }));
    vi.mocked(getDb).mockReturnValue({ select: vi.fn(() => ({ from: missingFrom })) } as never);

    await expect(accessControlService.assertArticleAccessible('user-1', 'article-2')).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it('validates bulk article access', async () => {
    const where = vi.fn().mockResolvedValue([{ id: 'article-1' }, { id: 'article-2' }]);
    const join = vi.fn(() => ({ where }));
    const from = vi.fn(() => ({ innerJoin: join }));
    vi.mocked(getDb).mockReturnValue({ select: vi.fn(() => ({ from })) } as never);

    await expect(
      accessControlService.assertArticlesAccessible('user-1', ['article-1', 'article-2', 'article-1']),
    ).resolves.toEqual(['article-1', 'article-2']);

    const partialWhere = vi.fn().mockResolvedValue([{ id: 'article-1' }]);
    const partialJoin = vi.fn(() => ({ where: partialWhere }));
    const partialFrom = vi.fn(() => ({ innerJoin: partialJoin }));
    vi.mocked(getDb).mockReturnValue({ select: vi.fn(() => ({ from: partialFrom })) } as never);

    await expect(
      accessControlService.assertArticlesAccessible('user-1', ['article-1', 'article-2']),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it('returns early for empty bulk article and tag checks', async () => {
    const select = vi.fn();
    vi.mocked(getDb).mockReturnValue({ select } as never);

    await expect(accessControlService.getAccessibleArticleIds('user-1', [])).resolves.toEqual([]);
    await expect(accessControlService.assertArticlesAccessible('user-1', [])).resolves.toEqual([]);
    await expect(accessControlService.assertTagsOwned('user-1', [])).resolves.toBeUndefined();

    expect(select).not.toHaveBeenCalled();
  });

  it('validates tag ownership and annotation access', async () => {
    const tagWhere = vi.fn().mockResolvedValue([{ id: 'tag-1' }, { id: 'tag-2' }]);
    const tagFrom = vi.fn(() => ({ where: tagWhere }));
    vi.mocked(getDb).mockReturnValue({ select: vi.fn(() => ({ from: tagFrom })) } as never);

    await expect(accessControlService.assertTagsOwned('user-1', ['tag-1', 'tag-2'])).resolves.toBeUndefined();

    const missingTagWhere = vi.fn().mockResolvedValue([{ id: 'tag-1' }]);
    const missingTagFrom = vi.fn(() => ({ where: missingTagWhere }));
    vi.mocked(getDb).mockReturnValue({ select: vi.fn(() => ({ from: missingTagFrom })) } as never);

    await expect(accessControlService.assertTagsOwned('user-1', ['tag-1', 'tag-2'])).rejects.toBeInstanceOf(ResourceNotFoundError);

    const annotationLimit = vi.fn().mockResolvedValue([{ id: 'annotation-1' }]);
    const annotationWhere = vi.fn(() => ({ limit: annotationLimit }));
    const secondJoin = vi.fn(() => ({ where: annotationWhere }));
    const firstJoin = vi.fn(() => ({ innerJoin: secondJoin }));
    const annotationFrom = vi.fn(() => ({ innerJoin: firstJoin }));
    vi.mocked(getDb).mockReturnValue({ select: vi.fn(() => ({ from: annotationFrom })) } as never);

    await expect(accessControlService.assertAnnotationAccessible('user-1', 'annotation-1')).resolves.toBeUndefined();

    const missingAnnotationLimit = vi.fn().mockResolvedValue([]);
    const missingAnnotationWhere = vi.fn(() => ({ limit: missingAnnotationLimit }));
    const missingSecondJoin = vi.fn(() => ({ where: missingAnnotationWhere }));
    const missingFirstJoin = vi.fn(() => ({ innerJoin: missingSecondJoin }));
    const missingAnnotationFrom = vi.fn(() => ({ innerJoin: missingFirstJoin }));
    vi.mocked(getDb).mockReturnValue({ select: vi.fn(() => ({ from: missingAnnotationFrom })) } as never);

    await expect(accessControlService.assertAnnotationAccessible('user-1', 'annotation-2')).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
