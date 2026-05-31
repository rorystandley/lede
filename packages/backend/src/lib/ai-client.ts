import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { AIProvider } from '@news-reader/shared';

export interface AIClient {
  summarize(text: string, opts?: { maxLength?: number }): Promise<string>;
  suggestTags(text: string, existingTags: string[]): Promise<string[]>;
  generateBriefing(articles: { title: string; summary: string }[]): Promise<string>;
}

class AnthropicClient implements AIClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async summarize(text: string, opts?: { maxLength?: number }): Promise<string> {
    const maxLen = opts?.maxLength ?? 150;
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: `Summarize the following article in ${maxLen} words or fewer. Be concise and capture the key points:\n\n${text.slice(0, 8000)}` }],
    });
    const block = response.content[0];
    return block.type === 'text' ? block.text : '';
  }

  async suggestTags(text: string, existingTags: string[]): Promise<string[]> {
    const tagList = existingTags.length > 0 ? `\nExisting tags to prefer: ${existingTags.join(', ')}` : '';
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{ role: 'user', content: `Suggest 2-5 short tags for this article. Return only comma-separated tag names, nothing else.${tagList}\n\nArticle:\n${text.slice(0, 4000)}` }],
    });
    const block = response.content[0];
    const raw = block.type === 'text' ? block.text : '';
    return raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 5);
  }

  async generateBriefing(articles: { title: string; summary: string }[]): Promise<string> {
    const list = articles.map((a, i) => `${i + 1}. ${a.title}: ${a.summary?.slice(0, 100) ?? ''}`).join('\n');
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [{ role: 'user', content: `You are a news briefing assistant. Given these ${articles.length} articles, write a 2-3 sentence overview highlighting the key themes and most important stories. Be concise.\n\nArticles:\n${list}` }],
    });
    const block = response.content[0];
    return block.type === 'text' ? block.text : '';
  }
}

class OpenAIClient implements AIClient {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async summarize(text: string, opts?: { maxLength?: number }): Promise<string> {
    const maxLen = opts?.maxLength ?? 150;
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 300,
      messages: [{ role: 'user', content: `Summarize the following article in ${maxLen} words or fewer. Be concise and capture the key points:\n\n${text.slice(0, 8000)}` }],
    });
    return response.choices[0]?.message?.content ?? '';
  }

  async suggestTags(text: string, existingTags: string[]): Promise<string[]> {
    const tagList = existingTags.length > 0 ? `\nExisting tags to prefer: ${existingTags.join(', ')}` : '';
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      messages: [{ role: 'user', content: `Suggest 2-5 short tags for this article. Return only comma-separated tag names, nothing else.${tagList}\n\nArticle:\n${text.slice(0, 4000)}` }],
    });
    const raw = response.choices[0]?.message?.content ?? '';
    return raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 5);
  }

  async generateBriefing(articles: { title: string; summary: string }[]): Promise<string> {
    const list = articles.map((a, i) => `${i + 1}. ${a.title}: ${a.summary?.slice(0, 100) ?? ''}`).join('\n');
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 400,
      messages: [{ role: 'user', content: `You are a news briefing assistant. Given these ${articles.length} articles, write a 2-3 sentence overview highlighting the key themes and most important stories. Be concise.\n\nArticles:\n${list}` }],
    });
    return response.choices[0]?.message?.content ?? '';
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
