import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../db/client.js';
import { getConfig } from '../config.js';
import { createAIClient } from '../lib/ai-client.js';
import { getLogger } from '../lib/logger.js';
import { aiCalls, aiTokensUsed } from '../lib/metrics.js';
import { accessControlService, ResourceNotFoundError } from './access-control.service.js';
import { aiService } from './ai.service.js';

vi.mock('../db/client.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('../config.js', () => ({
  getConfig: vi.fn(),
}));

vi.mock('../lib/ai-client.js', () => ({
  createAIClient: vi.fn(),
}));

vi.mock('../lib/logger.js', () => ({
  getLogger: vi.fn(),
}));

vi.mock('../lib/metrics.js', () => ({
  aiCalls: { inc: vi.fn() },
  aiTokensUsed: { inc: vi.fn() },
}));

vi.mock('./access-control.service.js', async () => {
  const actual = await vi.importActual<typeof import('./access-control.service.js')>('./access-control.service.js');
  return {
    ...actual,
    accessControlService: {
      getAccessibleArticle: vi.fn(),
    },
  };
});

describe('aiService', () => {
  const logger = {
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConfig).mockReturnValue({ ENCRYPTION_KEY: '1234567890abcdef1234567890abcdef' } as never);
    vi.mocked(getLogger).mockReturnValue(logger as never);
  });

  it('returns null when summarize cannot find a configured AI client or useful text', async () => {
    const eqCallback = vi.fn();
    vi.mocked(accessControlService.getAccessibleArticle)
      .mockResolvedValueOnce({
        id: 'article-1',
        title: 'Article',
        summary: 'Summary',
        contentText: 'Content',
      } as never)
      .mockResolvedValueOnce({
        id: 'article-2',
        title: null,
        summary: null,
        contentText: '',
      } as never);

    vi.mocked(getDb).mockReturnValue({
      query: {
        users: {
          findFirst: vi.fn()
            .mockImplementationOnce(async ({ where }) => {
              where({ id: 'users.id' }, { eq: eqCallback });
              return null;
            })
            .mockImplementationOnce(async ({ where }) => {
              where({ id: 'users.id' }, { eq: eqCallback });
              return {
                id: 'user-1',
                aiProvider: 'openai',
                aiApiKeyEnc: 'missing:bad',
              };
            }),
        },
      },
    } as never);

    await expect(aiService.summarize('user-1', 'article-1')).resolves.toBeNull();

    const encryptedKeys: string[] = [];
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn((values: { aiApiKeyEnc?: string | null }) => {
      if (values.aiApiKeyEnc) encryptedKeys.push(values.aiApiKeyEnc);
      return { where: updateWhere };
    });
    vi.mocked(getDb).mockReturnValue({
      update: vi.fn(() => ({ set: updateSet })),
    } as never);
    await aiService.updateUserAIConfig('user-1', 'openai', 'sk-test');

    vi.mocked(getDb).mockReturnValue({
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'user-1',
            aiProvider: 'openai',
            aiApiKeyEnc: encryptedKeys[0],
          }),
        },
      },
    } as never);
    vi.mocked(createAIClient).mockReturnValue({
      summarize: vi.fn(),
      suggestTags: vi.fn(),
      generateBriefing: vi.fn(),
    } as never);

    await expect(aiService.summarize('user-1', 'article-2')).resolves.toBeNull();
    expect(eqCallback).toHaveBeenCalledWith('users.id', 'user-1');
  });

  it('summarizes articles, decrypts API keys, and logs usage', async () => {
    const encryptedKeys: string[] = [];
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn((values: { aiApiKeyEnc?: string | null }) => {
      if (values.aiApiKeyEnc) encryptedKeys.push(values.aiApiKeyEnc);
      return { where: updateWhere };
    });

    vi.mocked(getDb).mockReturnValue({
      update: vi.fn(() => ({ set: updateSet })),
    } as never);
    await aiService.updateUserAIConfig('user-1', 'openai', 'sk-live');

    const summarize = vi.fn().mockResolvedValue({
      result: 'Short summary',
      usage: {
        model: 'gpt-4o-mini',
        inputTokens: 120,
        outputTokens: 35,
        estimatedCostUsd: 0.0025,
      },
    });
    vi.mocked(createAIClient).mockReturnValue({
      summarize,
      suggestTags: vi.fn(),
      generateBriefing: vi.fn(),
    } as never);
    vi.mocked(accessControlService.getAccessibleArticle).mockResolvedValue({
      id: 'article-1',
      title: 'Fallback title',
      summary: 'Fallback summary',
      contentText: 'Real article body',
    } as never);

    const usageInsert = vi.fn().mockResolvedValue(undefined);
    const queryFindFirst = vi.fn().mockResolvedValue({
      id: 'user-1',
      aiProvider: 'openai',
      aiApiKeyEnc: encryptedKeys[0],
    });
    vi.mocked(getDb).mockReturnValue({
      query: {
        users: {
          findFirst: queryFindFirst,
        },
      },
      insert: vi.fn(() => ({ values: usageInsert })),
    } as never);

    await expect(aiService.summarize('user-1', 'article-1')).resolves.toBe('Short summary');

    expect(createAIClient).toHaveBeenCalledWith('openai', 'sk-live');
    expect(summarize).toHaveBeenCalledWith('Real article body');
    expect(usageInsert).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: 'openai',
      model: 'gpt-4o-mini',
      operation: 'summarize',
      inputTokens: 120,
      outputTokens: 35,
      estimatedCostUsd: '0.002500',
    });
    expect(aiCalls.inc).toHaveBeenCalledWith({ provider: 'openai', operation: 'summarize', status: 'success' });
    expect(aiTokensUsed.inc).toHaveBeenNthCalledWith(1, { provider: 'openai', kind: 'input' }, 120);
    expect(aiTokensUsed.inc).toHaveBeenNthCalledWith(2, { provider: 'openai', kind: 'output' }, 35);
  });

  it('falls back from content text to summary and title when preparing AI prompts', async () => {
    const encryptedKeys: string[] = [];
    vi.mocked(getDb).mockReturnValue({
      update: vi.fn(() => ({
        set: vi.fn((values: { aiApiKeyEnc?: string | null }) => {
          if (values.aiApiKeyEnc) encryptedKeys.push(values.aiApiKeyEnc);
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
    } as never);
    await aiService.updateUserAIConfig('user-1', 'openai', 'sk-fallback');

    const summarize = vi.fn().mockResolvedValue({
      result: 'Summary fallback',
      usage: {
        model: 'gpt-4o-mini',
        inputTokens: 20,
        outputTokens: 5,
        estimatedCostUsd: 0.0001,
      },
    });
    const suggestTags = vi.fn().mockResolvedValue({
      result: ['title-tag'],
      usage: {
        model: 'gpt-4o-mini',
        inputTokens: 15,
        outputTokens: 4,
        estimatedCostUsd: 0.00005,
      },
    });
    vi.mocked(createAIClient).mockReturnValue({
      summarize,
      suggestTags,
      generateBriefing: vi.fn(),
    } as never);

    const queryFindFirst = vi.fn().mockResolvedValue({
      id: 'user-1',
      aiProvider: 'openai',
      aiApiKeyEnc: encryptedKeys[0],
    });
    const tagsWhere = vi.fn().mockResolvedValue([]);
    const tagsFrom = vi.fn(() => ({ where: tagsWhere }));
    vi.mocked(getDb).mockReturnValue({
      query: {
        users: {
          findFirst: queryFindFirst,
        },
      },
      select: vi.fn(() => ({ from: tagsFrom })),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    } as never);

    vi.mocked(accessControlService.getAccessibleArticle)
      .mockResolvedValueOnce({
        id: 'article-summary',
        title: 'Ignored title',
        summary: 'Use this summary',
        contentText: null,
      } as never)
      .mockResolvedValueOnce({
        id: 'article-title',
        title: 'Use this title',
        summary: null,
        contentText: null,
      } as never)
      .mockResolvedValueOnce({
        id: 'article-title-summary',
        title: 'Use this summarize title',
        summary: null,
        contentText: null,
      } as never)
      .mockResolvedValueOnce({
        id: 'article-summary-tags',
        title: 'Ignored tag title',
        summary: 'Use this tag summary',
        contentText: null,
      } as never);

    await expect(aiService.summarize('user-1', 'article-summary')).resolves.toBe('Summary fallback');
    await expect(aiService.suggestTags('user-1', 'article-title')).resolves.toEqual(['title-tag']);
    await expect(aiService.summarize('user-1', 'article-title-summary')).resolves.toBe('Summary fallback');
    await expect(aiService.suggestTags('user-1', 'article-summary-tags')).resolves.toEqual(['title-tag']);

    expect(summarize).toHaveBeenCalledWith('Use this summary');
    expect(summarize).toHaveBeenCalledWith('Use this summarize title');
    expect(suggestTags).toHaveBeenCalledWith('Use this title', []);
    expect(suggestTags).toHaveBeenCalledWith('Use this tag summary', []);
  });

  it('throws when summarize cannot access the article and logs downstream client failures', async () => {
    vi.mocked(accessControlService.getAccessibleArticle)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'article-2',
        title: 'Article',
        summary: null,
        contentText: 'Body',
      } as never);

    await expect(aiService.summarize('user-1', 'missing')).rejects.toBeInstanceOf(ResourceNotFoundError);

    const encryptedKeys: string[] = [];
    vi.mocked(getDb).mockReturnValue({
      update: vi.fn(() => ({
        set: vi.fn((values: { aiApiKeyEnc?: string | null }) => {
          if (values.aiApiKeyEnc) encryptedKeys.push(values.aiApiKeyEnc);
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
    } as never);
    await aiService.updateUserAIConfig('user-1', 'anthropic', 'ak-live');

    const summarize = vi.fn().mockRejectedValue(new Error('upstream failed'));
    vi.mocked(createAIClient).mockReturnValue({
      summarize,
      suggestTags: vi.fn(),
      generateBriefing: vi.fn(),
    } as never);
    vi.mocked(getDb).mockReturnValue({
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'user-1',
            aiProvider: 'anthropic',
            aiApiKeyEnc: encryptedKeys[0],
          }),
        },
      },
    } as never);

    await expect(aiService.summarize('user-1', 'article-2')).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      { userId: 'user-1', articleId: 'article-2', error: expect.any(Error) },
      'AI summarize failed',
    );
  });

  it('suggests tags, handles empty text, returns null when AI is not configured, and rethrows failures', async () => {
    const encryptedKeys: string[] = [];
    vi.mocked(getDb).mockReturnValue({
      update: vi.fn(() => ({
        set: vi.fn((values: { aiApiKeyEnc?: string | null }) => {
          if (values.aiApiKeyEnc) encryptedKeys.push(values.aiApiKeyEnc);
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
    } as never);
    await aiService.updateUserAIConfig('user-1', 'openai', 'sk-tags');

    const suggestTags = vi.fn()
      .mockResolvedValueOnce({
        result: ['ai', 'ml'],
        usage: {
          model: 'gpt-4o-mini',
          inputTokens: 50,
          outputTokens: 10,
          estimatedCostUsd: 0.0005,
        },
      })
      .mockRejectedValueOnce(new Error('tag failure'));
    vi.mocked(createAIClient).mockReturnValue({
      summarize: vi.fn(),
      suggestTags,
      generateBriefing: vi.fn(),
    } as never);

    const tagWhere = vi.fn().mockResolvedValue([{ name: 'AI' }, { name: 'Tech' }]);
    const tagFrom = vi.fn(() => ({ where: tagWhere }));
    const usageInsert = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getDb).mockReturnValue({
      query: {
        users: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({
              id: 'user-1',
              aiProvider: 'openai',
              aiApiKeyEnc: encryptedKeys[0],
            })
            .mockResolvedValueOnce({
              id: 'user-1',
              aiProvider: 'openai',
              aiApiKeyEnc: encryptedKeys[0],
            })
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
              id: 'user-1',
              aiProvider: 'openai',
              aiApiKeyEnc: encryptedKeys[0],
            }),
        },
      },
      select: vi.fn(() => ({ from: tagFrom })),
      insert: vi.fn(() => ({ values: usageInsert })),
    } as never);

    vi.mocked(accessControlService.getAccessibleArticle)
      .mockResolvedValueOnce({
        id: 'article-1',
        title: 'Title',
        summary: 'Summary',
        contentText: 'Body',
      } as never)
      .mockResolvedValueOnce({
        id: 'article-2',
        title: '',
        summary: '',
        contentText: '',
      } as never)
      .mockResolvedValueOnce({
        id: 'article-3',
        title: 'No config',
        summary: 'Summary',
        contentText: 'Body',
      } as never)
      .mockResolvedValueOnce({
        id: 'article-4',
        title: 'Boom',
        summary: 'Summary',
        contentText: 'Body',
      } as never);

    await expect(aiService.suggestTags('user-1', 'article-1')).resolves.toEqual(['ai', 'ml']);
    await expect(aiService.suggestTags('user-1', 'article-2')).resolves.toEqual([]);
    await expect(aiService.suggestTags('user-1', 'article-3')).resolves.toBeNull();
    await expect(aiService.suggestTags('user-1', 'article-4')).rejects.toThrow('tag failure');

    expect(suggestTags).toHaveBeenCalledWith('Body', ['AI', 'Tech']);
    expect(usageInsert).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: 'openai',
      model: 'gpt-4o-mini',
      operation: 'suggest_tags',
      inputTokens: 50,
      outputTokens: 10,
      estimatedCostUsd: '0.000500',
    });
    expect(logger.error).toHaveBeenCalledWith(
      { userId: 'user-1', articleId: 'article-4', error: expect.any(Error) },
      'AI suggest tags failed',
    );
  });

  it('uses summary/title fallbacks for AI text extraction and throws when suggestTags cannot access the article', async () => {
    const encryptedKeys: string[] = [];
    vi.mocked(getDb).mockReturnValue({
      update: vi.fn(() => ({
        set: vi.fn((values: { aiApiKeyEnc?: string | null }) => {
          if (values.aiApiKeyEnc) encryptedKeys.push(values.aiApiKeyEnc);
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
    } as never);
    await aiService.updateUserAIConfig('user-1', 'openai', 'sk-fallbacks');

    const summarize = vi.fn().mockResolvedValue({
      result: 'Summary fallback',
      usage: {
        model: 'gpt-4o-mini',
        inputTokens: 1,
        outputTokens: 1,
        estimatedCostUsd: 0.000001,
      },
    });
    const suggestTags = vi.fn().mockResolvedValue({
      result: ['title-tag'],
      usage: {
        model: 'gpt-4o-mini',
        inputTokens: 2,
        outputTokens: 1,
        estimatedCostUsd: 0.000002,
      },
    });
    vi.mocked(createAIClient).mockReturnValue({
      summarize,
      suggestTags,
      generateBriefing: vi.fn(),
    } as never);

    const usageInsert = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getDb).mockReturnValue({
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'user-1',
            aiProvider: 'openai',
            aiApiKeyEnc: encryptedKeys[0],
          }),
        },
      },
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
      insert: vi.fn(() => ({ values: usageInsert })),
    } as never);

    vi.mocked(accessControlService.getAccessibleArticle)
      .mockResolvedValueOnce({
        id: 'article-5',
        title: 'Title fallback',
        summary: 'Summary fallback',
        contentText: null,
      } as never)
      .mockResolvedValueOnce({
        id: 'article-6',
        title: 'Title only',
        summary: null,
        contentText: null,
      } as never)
      .mockResolvedValueOnce(null);

    await expect(aiService.summarize('user-1', 'article-5')).resolves.toBe('Summary fallback');
    await expect(aiService.suggestTags('user-1', 'article-6')).resolves.toEqual(['title-tag']);
    await expect(aiService.suggestTags('user-1', 'missing')).rejects.toBeInstanceOf(ResourceNotFoundError);

    expect(summarize).toHaveBeenCalledWith('Summary fallback');
    expect(suggestTags).toHaveBeenCalledWith('Title only', []);
  });

  it('generates briefings, swallows errors, and returns null when not configured', async () => {
    const encryptedKeys: string[] = [];
    vi.mocked(getDb).mockReturnValue({
      update: vi.fn(() => ({
        set: vi.fn((values: { aiApiKeyEnc?: string | null }) => {
          if (values.aiApiKeyEnc) encryptedKeys.push(values.aiApiKeyEnc);
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
    } as never);
    await aiService.updateUserAIConfig('user-1', 'openai', 'sk-brief');

    const generateBriefing = vi.fn()
      .mockResolvedValueOnce({
        result: 'Top stories',
        usage: {
          model: 'gpt-4o-mini',
          inputTokens: 75,
          outputTokens: 18,
          estimatedCostUsd: 0.00075,
        },
      })
      .mockRejectedValueOnce(new Error('brief fail'));
    vi.mocked(createAIClient).mockReturnValue({
      summarize: vi.fn(),
      suggestTags: vi.fn(),
      generateBriefing,
    } as never);

    const usageInsert = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getDb).mockReturnValue({
      query: {
        users: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({
              id: 'user-1',
              aiProvider: 'openai',
              aiApiKeyEnc: encryptedKeys[0],
            })
            .mockResolvedValueOnce({
              id: 'user-1',
              aiProvider: 'openai',
              aiApiKeyEnc: encryptedKeys[0],
            })
            .mockResolvedValueOnce(null),
        },
      },
      insert: vi.fn(() => ({ values: usageInsert })),
    } as never);

    const articleData = [{ title: 'A', summary: 'B' }];
    await expect(aiService.generateBriefing('user-1', articleData)).resolves.toBe('Top stories');
    await expect(aiService.generateBriefing('user-1', articleData)).resolves.toBeNull();
    await expect(aiService.generateBriefing('user-1', articleData)).resolves.toBeNull();

    expect(generateBriefing).toHaveBeenCalledWith(articleData);
    expect(usageInsert).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: 'openai',
      model: 'gpt-4o-mini',
      operation: 'briefing',
      inputTokens: 75,
      outputTokens: 18,
      estimatedCostUsd: '0.000750',
    });
    expect(logger.error).toHaveBeenCalledWith(
      { userId: 'user-1', error: expect.any(Error) },
      'AI briefing generation failed',
    );
  });

  it('returns usage stats, stores encrypted config, and reports config presence', async () => {
    vi.setSystemTime(new Date('2026-06-06T12:00:00.000Z'));
    const eqCallback = vi.fn();

    const monthlyWhere = vi.fn().mockResolvedValue([{ totalCalls: 7, totalInputTokens: 1000, totalOutputTokens: 200, totalCostUsd: 1.23 }]);
    const monthlyFrom = vi.fn(() => ({ where: monthlyWhere }));
    const todayWhere = vi.fn().mockResolvedValue([{ totalCalls: 2, totalCostUsd: 0.35 }]);
    const todayFrom = vi.fn(() => ({ where: todayWhere }));
    const byOperationGroupBy = vi.fn().mockResolvedValue([{ operation: 'summarize', count: 4, costUsd: 0.8 }]);
    const byOperationWhere = vi.fn(() => ({ groupBy: byOperationGroupBy }));
    const byOperationFrom = vi.fn(() => ({ where: byOperationWhere }));
    const recentLimit = vi.fn().mockResolvedValue([
      {
        id: 'usage-1',
        operation: 'briefing',
        model: 'gpt-4o-mini',
        inputTokens: 10,
        outputTokens: 5,
        estimatedCostUsd: '0.012500',
        createdAt: new Date('2026-06-06T11:00:00.000Z'),
      },
    ]);
    const recentOrderBy = vi.fn(() => ({ limit: recentLimit }));
    const recentWhere = vi.fn(() => ({ orderBy: recentOrderBy }));
    const recentFrom = vi.fn(() => ({ where: recentWhere }));

    const capturedUpdates: Array<{ aiProvider: string | null; aiApiKeyEnc: string | null }> = [];
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn((values: { aiProvider: string | null; aiApiKeyEnc: string | null }) => {
      capturedUpdates.push(values);
      return { where: updateWhere };
    });
    const queryFindFirst = vi.fn()
      .mockResolvedValueOnce({
        id: 'user-1',
        aiProvider: 'openai',
        aiApiKeyEnc: 'encrypted-key',
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        aiProvider: null,
        aiApiKeyEnc: null,
      });

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce({ from: monthlyFrom })
        .mockReturnValueOnce({ from: todayFrom })
        .mockReturnValueOnce({ from: byOperationFrom })
        .mockReturnValueOnce({ from: recentFrom }),
      update: vi.fn(() => ({ set: updateSet })),
      query: {
        users: {
          findFirst: vi.fn((args) => {
            args.where?.({ id: 'users.id' }, { eq: eqCallback });
            return queryFindFirst(args);
          }),
        },
      },
    } as never);

    await expect(aiService.getUsageStats('user-1')).resolves.toEqual({
      today: { calls: 2, costUsd: 0.35 },
      thisMonth: {
        calls: 7,
        inputTokens: 1000,
        outputTokens: 200,
        costUsd: 1.23,
      },
      byOperation: [{ operation: 'summarize', count: 4, costUsd: 0.8 }],
      recent: [{
        id: 'usage-1',
        operation: 'briefing',
        model: 'gpt-4o-mini',
        inputTokens: 10,
        outputTokens: 5,
        costUsd: 0.0125,
        createdAt: '2026-06-06T11:00:00.000Z',
      }],
    });

    await aiService.updateUserAIConfig('user-1', 'openai', 'store-me');
    await aiService.updateUserAIConfig('user-1', null, null);

    expect(capturedUpdates[0]).toEqual(
      expect.objectContaining({
        aiProvider: 'openai',
        aiApiKeyEnc: expect.stringMatching(/^[0-9a-f]+:[0-9a-f]+$/),
      }),
    );
    expect(capturedUpdates[1]).toEqual(
      expect.objectContaining({
        aiProvider: null,
        aiApiKeyEnc: null,
      }),
    );

    await expect(aiService.getUserAIConfig('user-1')).resolves.toEqual({ provider: 'openai', hasKey: true });
    await expect(aiService.getUserAIConfig('user-1')).resolves.toEqual({ provider: null, hasKey: false });
    expect(eqCallback).toHaveBeenCalledWith('users.id', 'user-1');
    vi.useRealTimers();
  });
});
