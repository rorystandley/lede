import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../db/client.js';
import { getLogger } from '../lib/logger.js';
import { tagService } from './tag.service.js';
import { ruleService } from './rule.service.js';

vi.mock('../db/client.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('../lib/logger.js', () => ({
  getLogger: vi.fn(),
}));

vi.mock('./tag.service.js', () => ({
  tagService: {
    addTagToArticle: vi.fn(),
  },
}));

describe('ruleService', () => {
  const logger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLogger).mockReturnValue(logger as never);
  });

  it('creates, updates, deletes, and lists rules', async () => {
    const createdAt = new Date('2026-06-06T10:00:00.000Z');
    const updatedAt = new Date('2026-06-06T11:00:00.000Z');
    const ruleRow = {
      id: 'rule-1',
      userId: 'user-1',
      name: 'Tech rule',
      enabled: true,
      priority: 1,
      conditions: [{ field: 'title', op: 'contains', value: 'AI' }],
      actions: [{ type: 'star' }],
      matchMode: 'all',
      runCount: 0,
      lastRunAt: null,
      createdAt,
      updatedAt,
    };
    const updatedRule = { ...ruleRow, name: 'Updated rule', priority: 2 };

    const insertReturning = vi.fn().mockResolvedValue([ruleRow]);
    const insertValues = vi.fn(() => ({ returning: insertReturning }));
    const updateReturning = vi.fn().mockResolvedValue([updatedRule]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const listOrderBy = vi.fn().mockResolvedValue([ruleRow]);
    const listWhere = vi.fn(() => ({ orderBy: listOrderBy }));
    const listFrom = vi.fn(() => ({ where: listWhere }));

    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn(() => ({ values: insertValues })),
      update: vi.fn(() => ({ set: updateSet })),
      delete: vi.fn(() => ({ where: deleteWhere })),
      select: vi.fn(() => ({ from: listFrom })),
    } as never);

    await expect(
      ruleService.create('user-1', {
        name: 'Tech rule',
        conditions: [{ field: 'title', op: 'contains', value: 'AI' }],
        actions: [{ type: 'star' }],
        priority: 1,
      }),
    ).resolves.toEqual({
      id: 'rule-1',
      userId: 'user-1',
      name: 'Tech rule',
      enabled: true,
      priority: 1,
      conditions: [{ field: 'title', op: 'contains', value: 'AI' }],
      actions: [{ type: 'star' }],
      matchMode: 'all',
      runCount: 0,
      lastRunAt: null,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });

    await expect(
      ruleService.update('user-1', 'rule-1', { name: 'Updated rule', priority: 2 }),
    ).resolves.toEqual({
      id: 'rule-1',
      userId: 'user-1',
      name: 'Updated rule',
      enabled: true,
      priority: 2,
      conditions: [{ field: 'title', op: 'contains', value: 'AI' }],
      actions: [{ type: 'star' }],
      matchMode: 'all',
      runCount: 0,
      lastRunAt: null,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });

    await expect(ruleService.delete('user-1', 'rule-1')).resolves.toBeUndefined();
    await expect(ruleService.listForUser('user-1')).resolves.toEqual([
      {
        id: 'rule-1',
        userId: 'user-1',
        name: 'Tech rule',
        enabled: true,
        priority: 1,
        conditions: [{ field: 'title', op: 'contains', value: 'AI' }],
        actions: [{ type: 'star' }],
        matchMode: 'all',
        runCount: 0,
        lastRunAt: null,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      },
    ]);

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Updated rule',
        priority: 2,
        updatedAt: expect.any(Date),
      }),
    );
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });

  it('throws when updating a missing rule', async () => {
    const updateReturning = vi.fn().mockResolvedValue([]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));

    vi.mocked(getDb).mockReturnValue({
      update: vi.fn(() => ({ set: updateSet })),
    } as never);

    await expect(ruleService.update('user-1', 'missing', { name: 'Nope' })).rejects.toThrow('Rule not found');
  });

  it('defaults priority and match mode when creating a rule', async () => {
    const createdAt = new Date('2026-06-06T12:00:00.000Z');
    const updatedAt = new Date('2026-06-06T12:30:00.000Z');
    const insertReturning = vi.fn().mockResolvedValue([{
      id: 'rule-defaults',
      userId: 'user-1',
      name: 'Defaults',
      enabled: true,
      priority: 0,
      conditions: [{ field: 'title', op: 'contains', value: 'AI' }],
      actions: [],
      matchMode: 'all',
      runCount: 0,
      lastRunAt: null,
      createdAt,
      updatedAt,
    }]);
    const insertValues = vi.fn(() => ({ returning: insertReturning }));

    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn(() => ({ values: insertValues })),
    } as never);

    await expect(ruleService.create('user-1', {
      name: 'Defaults',
      conditions: [{ field: 'title', op: 'contains', value: 'AI' }],
      actions: [],
    })).resolves.toEqual({
      id: 'rule-defaults',
      userId: 'user-1',
      name: 'Defaults',
      enabled: true,
      priority: 0,
      conditions: [{ field: 'title', op: 'contains', value: 'AI' }],
      actions: [],
      matchMode: 'all',
      runCount: 0,
      lastRunAt: null,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      priority: 0,
      matchMode: 'all',
    }));
  });

  it('serializes a non-null lastRunAt value when listing rules', async () => {
    const row = {
      id: 'rule-last-run',
      userId: 'user-1',
      name: 'Ran already',
      enabled: true,
      priority: 1,
      conditions: [],
      actions: [],
      matchMode: 'all',
      runCount: 2,
      lastRunAt: new Date('2026-06-06T09:30:00.000Z'),
      createdAt: new Date('2026-06-06T09:00:00.000Z'),
      updatedAt: new Date('2026-06-06T10:00:00.000Z'),
    };
    const orderBy = vi.fn().mockResolvedValue([row]);
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from })),
    } as never);

    await expect(ruleService.listForUser('user-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'rule-last-run',
        lastRunAt: '2026-06-06T09:30:00.000Z',
      }),
    ]);
  });

  it('evaluates matching rules and executes tag, state, and webhook actions', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const ruleRows = [
      {
        id: 'rule-1',
        userId: 'user-1',
        name: 'Match all',
        enabled: true,
        priority: 1,
        conditions: [
          { field: 'title', op: 'contains', value: 'AI' },
          { field: 'folder_id', op: 'equals', value: 'folder-1' },
        ],
        actions: [
          { type: 'tag', tagId: 'tag-1' },
          { type: 'star' },
          { type: 'mark_read' },
          { type: 'mark_archived' },
          { type: 'webhook', url: 'https://hooks.example.com/path?secret=1' },
        ],
        matchMode: 'all',
        runCount: 2,
      },
    ];
    const article = {
      id: 'article-1',
      feedId: 'feed-1',
      title: 'AI Weekly',
      contentText: 'Deep learning roundup',
      summary: 'Summary',
      author: 'Ada',
      url: 'https://example.com/story',
    };
    const feed = { id: 'feed-1', title: 'Tech Feed' };
    const sub = { folderId: 'folder-1' };

    const rulesWhere = vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue(ruleRows) }));
    const rulesFrom = vi.fn(() => ({ where: rulesWhere }));
    const articleWhere = vi.fn().mockResolvedValue([article]);
    const articleFrom = vi.fn(() => ({ where: articleWhere }));
    const feedWhere = vi.fn().mockResolvedValue([feed]);
    const feedFrom = vi.fn(() => ({ where: feedWhere }));
    const insertOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const insertValues = vi.fn(() => ({ onConflictDoUpdate: insertOnConflictDoUpdate }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: rulesFrom })
      .mockReturnValueOnce({ from: articleFrom })
      .mockReturnValueOnce({ from: feedFrom });

    vi.mocked(getDb).mockReturnValue({
      select,
      query: {
        userFeedSubscriptions: {
          findFirst: vi.fn().mockResolvedValue(sub),
        },
      },
      insert: vi.fn(() => ({ values: insertValues })),
      update: vi.fn(() => ({ set: updateSet })),
    } as never);

    await expect(ruleService.evaluateForArticle('user-1', 'article-1')).resolves.toBeUndefined();

    expect(logger.info).toHaveBeenCalledWith(
      { ruleId: 'rule-1', articleId: 'article-1', ruleName: 'Match all' },
      'Rule matched',
    );
    expect(tagService.addTagToArticle).toHaveBeenCalledWith('user-1', 'article-1', 'tag-1', 'rule');
    expect(insertValues).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.example.com/path?secret=1',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: 'article-1', userId: 'user-1', action: 'rule_match' }),
      }),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      { ruleId: 'rule-1', url: 'https://hooks.example.com/path', status: 200, attempt: 1 },
      'Webhook delivered',
    );
    expect(updateSet).toHaveBeenCalledWith({
      runCount: 3,
      lastRunAt: expect.any(Date),
    });
    vi.useRealTimers();
  });

  it('skips evaluation when there are no rules or the article is missing', async () => {
    const noRulesWhere = vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue([]) }));
    const noRulesFrom = vi.fn(() => ({ where: noRulesWhere }));
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from: noRulesFrom })),
    } as never);

    await expect(ruleService.evaluateForArticle('user-1', 'article-1')).resolves.toBeUndefined();

    const rulesWhere = vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue([{ id: 'rule-1', conditions: [], actions: [], matchMode: 'all', runCount: 0, name: 'x' }]) }));
    const rulesFrom = vi.fn(() => ({ where: rulesWhere }));
    const articleWhere = vi.fn().mockResolvedValue([]);
    const articleFrom = vi.fn(() => ({ where: articleWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: rulesFrom })
      .mockReturnValueOnce({ from: articleFrom });

    vi.mocked(getDb).mockReturnValue({
      select,
      query: {
        userFeedSubscriptions: {
          findFirst: vi.fn(),
        },
      },
    } as never);

    await expect(ruleService.evaluateForArticle('user-1', 'article-1')).resolves.toBeUndefined();
  });

  it('supports any-match rules, invalid regexes, webhook retries, and sanitizes webhook URLs in logs', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockRejectedValueOnce(new Error('still broken'))
      .mockRejectedValueOnce(new Error('still broken'))
      .mockRejectedValueOnce(new Error('still broken'));
    vi.stubGlobal('fetch', fetchMock);

    const ruleRows = [
      {
        id: 'rule-any',
        userId: 'user-1',
        name: 'Any match',
        enabled: true,
        priority: 1,
        conditions: [
          { field: 'title', op: 'matches_regex', value: '[' },
          { field: 'author', op: 'equals', value: 'Ada' },
        ],
        actions: [{ type: 'webhook', url: 'https://hooks.example.com/path?secret=1' }],
        matchMode: 'any',
        runCount: 0,
      },
      {
        id: 'rule-bad',
        userId: 'user-1',
        name: 'Always fail webhook',
        enabled: true,
        priority: 2,
        conditions: [{ field: 'url', op: 'contains', value: 'example.com' }],
        actions: [{ type: 'webhook', url: 'notaurl' }],
        matchMode: 'all',
        runCount: 0,
      },
    ];
    const article = {
      id: 'article-1',
      feedId: 'feed-1',
      title: 'AI Weekly',
      contentText: 'Deep learning roundup',
      summary: 'Summary',
      author: 'Ada',
      url: 'https://example.com/story',
    };
    const feed = { id: 'feed-1', title: 'Tech Feed' };

    const rulesWhere = vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue(ruleRows) }));
    const rulesFrom = vi.fn(() => ({ where: rulesWhere }));
    const articleWhere = vi.fn().mockResolvedValue([article]);
    const articleFrom = vi.fn(() => ({ where: articleWhere }));
    const feedWhere = vi.fn().mockResolvedValue([feed]);
    const feedFrom = vi.fn(() => ({ where: feedWhere }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: rulesFrom })
      .mockReturnValueOnce({ from: articleFrom })
      .mockReturnValueOnce({ from: feedFrom });

    vi.mocked(getDb).mockReturnValue({
      select,
      query: {
        userFeedSubscriptions: {
          findFirst: vi.fn().mockResolvedValue({ folderId: 'folder-2' }),
        },
      },
      insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn() })) })),
      update: vi.fn(() => ({ set: updateSet })),
    } as never);

    const evaluationPromise = ruleService.evaluateForArticle('user-1', 'article-1');
    await vi.runAllTimersAsync();
    await evaluationPromise;

    expect(logger.debug).toHaveBeenCalledWith(
      { ruleId: 'rule-any', url: 'https://hooks.example.com/path', status: 500, attempt: 1 },
      'Webhook returned non-2xx, retrying',
    );
    expect(logger.debug).toHaveBeenCalledWith(
      { ruleId: 'rule-any', url: 'https://hooks.example.com/path', error: 'network down', attempt: 2 },
      'Webhook request error, retrying',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      { ruleId: 'rule-bad', url: '<invalid-url>', error: 'still broken', attempt: 3 },
      'Webhook failed after 3 attempts: still broken',
    );
    expect(updateWhere).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('covers fallback rule condition branches for blank fields, negated operators, and unknown values', async () => {
    const ruleRows = [
      {
        id: 'rule-title',
        userId: 'user-1',
        name: 'Blank title',
        enabled: true,
        priority: 1,
        conditions: [{ field: 'title', op: 'not_contains', value: 'blocked' }],
        actions: [],
        matchMode: 'all',
        runCount: 0,
      },
      {
        id: 'rule-content',
        userId: 'user-1',
        name: 'Summary fallback',
        enabled: true,
        priority: 2,
        conditions: [{ field: 'content', op: 'not_contains', value: 'blocked' }],
        actions: [],
        matchMode: 'all',
        runCount: 0,
      },
      {
        id: 'rule-author',
        userId: 'user-1',
        name: 'Blank author',
        enabled: true,
        priority: 3,
        conditions: [{ field: 'author', op: 'not_equals', value: 'Ada' }],
        actions: [],
        matchMode: 'all',
        runCount: 0,
      },
      {
        id: 'rule-url',
        userId: 'user-1',
        name: 'Blank url',
        enabled: true,
        priority: 4,
        conditions: [{ field: 'url', op: 'not_equals', value: 'https://blocked.example' }],
        actions: [],
        matchMode: 'all',
        runCount: 0,
      },
      {
        id: 'rule-feed',
        userId: 'user-1',
        name: 'Feed id',
        enabled: true,
        priority: 5,
        conditions: [{ field: 'feed_id', op: 'equals', value: 'feed-2' }],
        actions: [],
        matchMode: 'all',
        runCount: 0,
      },
      {
        id: 'rule-folder',
        userId: 'user-1',
        name: 'Missing folder id',
        enabled: true,
        priority: 6,
        conditions: [{ field: 'folder_id', op: 'not_equals', value: 'folder-1' }],
        actions: [],
        matchMode: 'all',
        runCount: 0,
      },
      {
        id: 'rule-regex',
        userId: 'user-1',
        name: 'Regex fallback',
        enabled: true,
        priority: 7,
        conditions: [
          { field: 'title', op: 'matches_regex', value: '[' },
          { field: 'content', op: 'not_contains', value: 'blocked' },
        ],
        actions: [],
        matchMode: 'any',
        runCount: 0,
      },
      {
        id: 'rule-unknown-field',
        userId: 'user-1',
        name: 'Unknown field',
        enabled: true,
        priority: 8,
        conditions: [{ field: 'unknown_field', op: 'contains', value: 'x' } as never],
        actions: [],
        matchMode: 'all',
        runCount: 0,
      },
      {
        id: 'rule-unknown-op',
        userId: 'user-1',
        name: 'Unknown op',
        enabled: true,
        priority: 9,
        conditions: [{ field: 'title', op: 'unknown_op', value: 'x' } as never],
        actions: [],
        matchMode: 'all',
        runCount: 0,
      },
    ];
    const article = {
      id: 'article-2',
      feedId: 'feed-2',
      title: null,
      contentText: null,
      summary: 'Summary fallback body',
      author: null,
      url: null,
    };
    const feed = { id: 'feed-2', title: 'Rules Feed' };

    const rulesWhere = vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue(ruleRows) }));
    const rulesFrom = vi.fn(() => ({ where: rulesWhere }));
    const articleWhere = vi.fn().mockResolvedValue([article]);
    const articleFrom = vi.fn(() => ({ where: articleWhere }));
    const feedWhere = vi.fn().mockResolvedValue([feed]);
    const feedFrom = vi.fn(() => ({ where: feedWhere }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: rulesFrom })
      .mockReturnValueOnce({ from: articleFrom })
      .mockReturnValueOnce({ from: feedFrom });
    const findFirst = vi.fn(async (query: {
      where: (ufs: { userId: string; feedId: string }, ops: { and: (...args: string[]) => string; eq: (left: string, right: string) => string }) => string;
    }) => {
      expect(query.where(
        { userId: 'subs.userId', feedId: 'subs.feedId' },
        { and: (...args) => args.join(' AND '), eq: (left, right) => `${left}=${right}` },
      )).toBe('subs.userId=user-1 AND subs.feedId=feed-2');
      return undefined;
    });

    vi.mocked(getDb).mockReturnValue({
      select,
      query: {
        userFeedSubscriptions: {
          findFirst,
        },
      },
      update: vi.fn(() => ({ set: updateSet })),
    } as never);

    await expect(ruleService.evaluateForArticle('user-1', 'article-2')).resolves.toBeUndefined();

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(updateWhere).toHaveBeenCalledTimes(7);
    expect(logger.info).toHaveBeenCalledTimes(7);
  });

  it('stringifies non-Error webhook failures on the final attempt', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce('nope')
      .mockRejectedValueOnce('still nope')
      .mockRejectedValueOnce('final nope');
    vi.stubGlobal('fetch', fetchMock);

    const rulesWhere = vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue([{
      id: 'rule-string-error',
      userId: 'user-1',
      name: 'String webhook error',
      enabled: true,
      priority: 1,
      conditions: [{ field: 'feed_id', op: 'equals', value: 'feed-3' }],
      actions: [{ type: 'webhook', url: 'https://hooks.example.com/stringy?secret=1' }],
      matchMode: 'all',
      runCount: 0,
    }]) }));
    const rulesFrom = vi.fn(() => ({ where: rulesWhere }));
    const articleWhere = vi.fn().mockResolvedValue([{
      id: 'article-3',
      feedId: 'feed-3',
      title: 'Story',
      contentText: 'Body',
      summary: 'Body',
      author: 'Ada',
      url: 'https://example.com/story',
    }]);
    const articleFrom = vi.fn(() => ({ where: articleWhere }));
    const feedWhere = vi.fn().mockResolvedValue([{ id: 'feed-3', title: 'Feed 3' }]);
    const feedFrom = vi.fn(() => ({ where: feedWhere }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: rulesFrom })
        .mockReturnValueOnce({ from: articleFrom })
        .mockReturnValueOnce({ from: feedFrom }),
      query: {
        userFeedSubscriptions: {
          findFirst: vi.fn().mockResolvedValue({ folderId: null }),
        },
      },
      update: vi.fn(() => ({ set: updateSet })),
    } as never);

    const evaluationPromise = ruleService.evaluateForArticle('user-1', 'article-3');
    await vi.runAllTimersAsync();
    await evaluationPromise;

    expect(logger.warn).toHaveBeenCalledWith(
      { ruleId: 'rule-string-error', url: 'https://hooks.example.com/stringy', error: 'final nope', attempt: 3 },
      'Webhook failed after 3 attempts: final nope',
    );
    expect(updateWhere).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('falls back to an empty content string when both contentText and summary are missing', async () => {
    const rulesWhere = vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue([{
      id: 'rule-empty-content',
      userId: 'user-1',
      name: 'Empty content fallback',
      enabled: true,
      priority: 1,
      conditions: [{ field: 'content', op: 'equals', value: '' }],
      actions: [],
      matchMode: 'all',
      runCount: 0,
    }]) }));
    const rulesFrom = vi.fn(() => ({ where: rulesWhere }));
    const articleWhere = vi.fn().mockResolvedValue([{
      id: 'article-4',
      feedId: 'feed-4',
      title: 'Story',
      contentText: null,
      summary: null,
      author: 'Ada',
      url: 'https://example.com/story',
    }]);
    const articleFrom = vi.fn(() => ({ where: articleWhere }));
    const feedWhere = vi.fn().mockResolvedValue([{ id: 'feed-4', title: 'Feed 4' }]);
    const feedFrom = vi.fn(() => ({ where: feedWhere }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: rulesFrom })
        .mockReturnValueOnce({ from: articleFrom })
        .mockReturnValueOnce({ from: feedFrom }),
      query: {
        userFeedSubscriptions: {
          findFirst: vi.fn().mockResolvedValue({ folderId: null }),
        },
      },
      update: vi.fn(() => ({ set: updateSet })),
    } as never);

    await expect(ruleService.evaluateForArticle('user-1', 'article-4')).resolves.toBeUndefined();
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });
});
