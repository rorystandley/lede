import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  anthropicCreateMock,
  openaiCreateMock,
  AnthropicFake,
  OpenAIFake,
} = vi.hoisted(() => {
  const anthropicCreateMock = vi.fn();
  const openaiCreateMock = vi.fn();

  class AnthropicFake {
    static instances: AnthropicFake[] = [];
    apiKey: string;
    messages = {
      create: anthropicCreateMock,
    };

    constructor({ apiKey }: { apiKey: string }) {
      this.apiKey = apiKey;
      AnthropicFake.instances.push(this);
    }
  }

  class OpenAIFake {
    static instances: OpenAIFake[] = [];
    apiKey: string;
    chat = {
      completions: {
        create: openaiCreateMock,
      },
    };

    constructor({ apiKey }: { apiKey: string }) {
      this.apiKey = apiKey;
      OpenAIFake.instances.push(this);
    }
  }

  return {
    anthropicCreateMock,
    openaiCreateMock,
    AnthropicFake,
    OpenAIFake,
  };
});

vi.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: AnthropicFake,
}));

vi.mock('openai', () => ({
  __esModule: true,
  default: OpenAIFake,
}));

import { createAIClient } from './ai-client.js';

describe('ai client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    AnthropicFake.instances.length = 0;
    OpenAIFake.instances.length = 0;
  });

  it('supports anthropic summarize, tag suggestions, and briefings', async () => {
    anthropicCreateMock
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Anthropic summary' }],
        usage: { input_tokens: 1500, output_tokens: 300 },
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: ' AI, ML , News, ,  tech , extra ' }],
        usage: { input_tokens: 900, output_tokens: 120 },
      })
      .mockResolvedValueOnce({
        content: [{ type: 'image' }],
        usage: { input_tokens: 1000, output_tokens: 50 },
      });

    const client = createAIClient('anthropic', 'ak-test');

    await expect(client.summarize('x'.repeat(9000), { maxLength: 80 })).resolves.toEqual({
      result: 'Anthropic summary',
      usage: {
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1500,
        outputTokens: 300,
        estimatedCostUsd: 0.009000000000000001,
      },
    });

    await expect(client.suggestTags('body', ['AI', 'Tech'])).resolves.toEqual({
      result: ['ai', 'ml', 'news', 'tech', 'extra'],
      usage: {
        model: 'claude-sonnet-4-20250514',
        inputTokens: 900,
        outputTokens: 120,
        estimatedCostUsd: 0.0045000000000000005,
      },
    });

    await expect(
      client.generateBriefing([
        { title: 'One', summary: 'A'.repeat(150) },
        { title: 'Two', summary: 'Short summary' },
      ]),
    ).resolves.toEqual({
      result: '',
      usage: {
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1000,
        outputTokens: 50,
        estimatedCostUsd: 0.00375,
      },
    });

    expect(AnthropicFake.instances[0]?.apiKey).toBe('ak-test');
    expect(anthropicCreateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('80 words or fewer'),
          },
        ],
      }),
    );
    expect(anthropicCreateMock.mock.calls[0]?.[0]?.messages?.[0]?.content).toHaveLength(
      'Summarize the following article in 80 words or fewer. Be concise and capture the key points:\n\n'.length + 8000,
    );
    expect(anthropicCreateMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('Existing tags to prefer: AI, Tech'),
          },
        ],
      }),
    );
    expect(anthropicCreateMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('1. One:'),
          },
        ],
      }),
    );
  });

  it('supports openai summarize, tag suggestions, and briefings', async () => {
    openaiCreateMock
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'OpenAI summary' } }],
        usage: { prompt_tokens: 2000, completion_tokens: 250 },
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'OpenAI summary with max length' } }],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Science,  Space, space,  Innovation ' } }],
        usage: { prompt_tokens: 400, completion_tokens: 60 },
      })
      .mockResolvedValueOnce({
        choices: [],
        usage: {},
      });

    const client = createAIClient('openai', 'sk-test');

    await expect(client.summarize('article body')).resolves.toEqual({
      result: 'OpenAI summary',
      usage: {
        model: 'gpt-4o-mini',
        inputTokens: 2000,
        outputTokens: 250,
        estimatedCostUsd: 0.00045,
      },
    });

    await expect(client.summarize('article body', { maxLength: 40 })).resolves.toEqual({
      result: 'OpenAI summary with max length',
      usage: {
        model: 'gpt-4o-mini',
        inputTokens: 100,
        outputTokens: 20,
        estimatedCostUsd: 0.000027,
      },
    });

    await expect(client.suggestTags('body', [])).resolves.toEqual({
      result: ['science', 'space', 'space', 'innovation'],
      usage: {
        model: 'gpt-4o-mini',
        inputTokens: 400,
        outputTokens: 60,
        estimatedCostUsd: 0.000096,
      },
    });

    await expect(
      client.generateBriefing([{ title: 'Headline', summary: 'Summary' }]),
    ).resolves.toEqual({
      result: '',
      usage: {
        model: 'gpt-4o-mini',
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
      },
    });

    expect(OpenAIFake.instances[0]?.apiKey).toBe('sk-test');
    expect(openaiCreateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        model: 'gpt-4o-mini',
        max_tokens: 300,
      }),
    );
    expect(openaiCreateMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('40 words or fewer'),
          },
        ],
      }),
    );
    expect(openaiCreateMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('Return only comma-separated tag names'),
          },
        ],
      }),
    );
    expect(openaiCreateMock).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('1. Headline: Summary'),
          },
        ],
      }),
    );
  });

  it('throws for unsupported providers', () => {
    expect(() => createAIClient('bogus' as never, 'key')).toThrow('Unsupported AI provider: bogus');
  });

  it('covers anthropic fallback branches for defaults, non-text blocks, empty tags, and unknown pricing', async () => {
    anthropicCreateMock
      .mockResolvedValueOnce({
        content: [{ type: 'image' }],
        usage: { input_tokens: 10, output_tokens: 20 },
      })
      .mockResolvedValueOnce({
        content: [{ type: 'image' }],
        usage: { input_tokens: 30, output_tokens: 40 },
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Brief result' }],
        usage: { input_tokens: 50, output_tokens: 60 },
      });

    const client = createAIClient('anthropic', 'ak-fallback') as any;
    client.model = 'unknown-model';

    await expect(client.summarize('body text')).resolves.toEqual({
      result: '',
      usage: {
        model: 'unknown-model',
        inputTokens: 10,
        outputTokens: 20,
        estimatedCostUsd: 0,
      },
    });

    await expect(client.suggestTags('body text', [])).resolves.toEqual({
      result: [],
      usage: {
        model: 'unknown-model',
        inputTokens: 30,
        outputTokens: 40,
        estimatedCostUsd: 0,
      },
    });

    await expect(
      client.generateBriefing([{ title: 'Only title', summary: undefined }]),
    ).resolves.toEqual({
      result: 'Brief result',
      usage: {
        model: 'unknown-model',
        inputTokens: 50,
        outputTokens: 60,
        estimatedCostUsd: 0,
      },
    });

    expect(anthropicCreateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('150 words or fewer'),
          },
        ],
      }),
    );
    expect(anthropicCreateMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: expect.not.stringContaining('Existing tags to prefer:'),
          },
        ],
      }),
    );
    expect(anthropicCreateMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('1. Only title: '),
          },
        ],
      }),
    );
  });

  it('covers openai fallback branches for defaults, missing usage, empty message content, and summary fallbacks', async () => {
    openaiCreateMock
      .mockResolvedValueOnce({
        choices: [],
        usage: undefined,
      })
      .mockResolvedValueOnce({
        choices: [{ message: {} }],
        usage: {},
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'OpenAI briefing' } }],
        usage: undefined,
      });

    const client = createAIClient('openai', 'sk-fallback');

    await expect(client.summarize('article body')).resolves.toEqual({
      result: '',
      usage: {
        model: 'gpt-4o-mini',
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
      },
    });

    await expect(client.suggestTags('body', ['Space'])).resolves.toEqual({
      result: [],
      usage: {
        model: 'gpt-4o-mini',
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
      },
    });

    await expect(
      client.generateBriefing([{ title: 'Headline', summary: undefined as never }]),
    ).resolves.toEqual({
      result: 'OpenAI briefing',
      usage: {
        model: 'gpt-4o-mini',
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
      },
    });

    expect(openaiCreateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('150 words or fewer'),
          },
        ],
      }),
    );
    expect(openaiCreateMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('Existing tags to prefer: Space'),
          },
        ],
      }),
    );
    expect(openaiCreateMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('1. Headline: '),
          },
        ],
      }),
    );
  });
});
