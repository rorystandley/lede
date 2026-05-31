import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { AIProvider } from '@news-reader/shared';

export interface AIUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface AIResponse<T> {
  result: T;
  usage: AIUsage;
}

export interface AIClient {
  summarize(text: string, opts?: { maxLength?: number }): Promise<AIResponse<string>>;
  suggestTags(text: string, existingTags: string[]): Promise<AIResponse<string[]>>;
  generateBriefing(articles: { title: string; summary: string }[]): Promise<AIResponse<string>>;
}

// Pricing as of 2026 (USD per 1M tokens)
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

class AnthropicClient implements AIClient {
  private client: Anthropic;
  private model = 'claude-sonnet-4-20250514';

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  private buildUsage(input: number, output: number): AIUsage {
    return { model: this.model, inputTokens: input, outputTokens: output, estimatedCostUsd: estimateCost(this.model, input, output) };
  }

  async summarize(text: string, opts?: { maxLength?: number }): Promise<AIResponse<string>> {
    const maxLen = opts?.maxLength ?? 150;
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 300,
      messages: [{ role: 'user', content: `Summarize the following article in ${maxLen} words or fewer. Be concise and capture the key points:\n\n${text.slice(0, 8000)}` }],
    });
    const block = response.content[0];
    const result = block.type === 'text' ? block.text : '';
    return { result, usage: this.buildUsage(response.usage.input_tokens, response.usage.output_tokens) };
  }

  async suggestTags(text: string, existingTags: string[]): Promise<AIResponse<string[]>> {
    const tagList = existingTags.length > 0 ? `\nExisting tags to prefer: ${existingTags.join(', ')}` : '';
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 200,
      messages: [{ role: 'user', content: `Suggest 2-5 short tags for this article. Return only comma-separated tag names, nothing else.${tagList}\n\nArticle:\n${text.slice(0, 4000)}` }],
    });
    const block = response.content[0];
    const raw = block.type === 'text' ? block.text : '';
    const result = raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 5);
    return { result, usage: this.buildUsage(response.usage.input_tokens, response.usage.output_tokens) };
  }

  async generateBriefing(articles: { title: string; summary: string }[]): Promise<AIResponse<string>> {
    const list = articles.map((a, i) => `${i + 1}. ${a.title}: ${a.summary?.slice(0, 100) ?? ''}`).join('\n');
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 400,
      messages: [{ role: 'user', content: `You are a news briefing assistant. Given these ${articles.length} articles, write a 2-3 sentence overview highlighting the key themes and most important stories. Be concise.\n\nArticles:\n${list}` }],
    });
    const block = response.content[0];
    const result = block.type === 'text' ? block.text : '';
    return { result, usage: this.buildUsage(response.usage.input_tokens, response.usage.output_tokens) };
  }
}

class OpenAIClient implements AIClient {
  private client: OpenAI;
  private model = 'gpt-4o-mini';

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  private buildUsage(input: number, output: number): AIUsage {
    return { model: this.model, inputTokens: input, outputTokens: output, estimatedCostUsd: estimateCost(this.model, input, output) };
  }

  async summarize(text: string, opts?: { maxLength?: number }): Promise<AIResponse<string>> {
    const maxLen = opts?.maxLength ?? 150;
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 300,
      messages: [{ role: 'user', content: `Summarize the following article in ${maxLen} words or fewer. Be concise and capture the key points:\n\n${text.slice(0, 8000)}` }],
    });
    return { result: response.choices[0]?.message?.content ?? '', usage: this.buildUsage(response.usage?.prompt_tokens ?? 0, response.usage?.completion_tokens ?? 0) };
  }

  async suggestTags(text: string, existingTags: string[]): Promise<AIResponse<string[]>> {
    const tagList = existingTags.length > 0 ? `\nExisting tags to prefer: ${existingTags.join(', ')}` : '';
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 200,
      messages: [{ role: 'user', content: `Suggest 2-5 short tags for this article. Return only comma-separated tag names, nothing else.${tagList}\n\nArticle:\n${text.slice(0, 4000)}` }],
    });
    const raw = response.choices[0]?.message?.content ?? '';
    const result = raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 5);
    return { result, usage: this.buildUsage(response.usage?.prompt_tokens ?? 0, response.usage?.completion_tokens ?? 0) };
  }

  async generateBriefing(articles: { title: string; summary: string }[]): Promise<AIResponse<string>> {
    const list = articles.map((a, i) => `${i + 1}. ${a.title}: ${a.summary?.slice(0, 100) ?? ''}`).join('\n');
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 400,
      messages: [{ role: 'user', content: `You are a news briefing assistant. Given these ${articles.length} articles, write a 2-3 sentence overview highlighting the key themes and most important stories. Be concise.\n\nArticles:\n${list}` }],
    });
    return { result: response.choices[0]?.message?.content ?? '', usage: this.buildUsage(response.usage?.prompt_tokens ?? 0, response.usage?.completion_tokens ?? 0) };
  }
}

export function createAIClient(provider: AIProvider, apiKey: string): AIClient {
  switch (provider) {
    case 'anthropic':
      return new AnthropicClient(apiKey);
    case 'openai':
      return new OpenAIClient(apiKey);
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
