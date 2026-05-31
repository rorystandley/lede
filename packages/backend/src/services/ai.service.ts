import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { users, articles, tags } from '../db/schema/index.js';
import { createAIClient, type AIClient } from '../lib/ai-client.js';
import { getLogger } from '../lib/logger.js';
import { getConfig } from '../config.js';
import crypto from 'node:crypto';
import type { AIProvider } from '@news-reader/shared';

export class AIService {
  private async getClient(userId: string): Promise<AIClient | null> {
    const db = getDb();
    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, userId),
    });

    if (!user?.aiProvider || !user?.aiApiKeyEnc) return null;

    const apiKey = this.decrypt(user.aiApiKeyEnc);
    return createAIClient(user.aiProvider as AIProvider, apiKey);
  }

  async summarize(userId: string, articleId: string): Promise<string | null> {
    const logger = getLogger();
    const client = await this.getClient(userId);
    if (!client) return null;

    const db = getDb();
    const [article] = await db.select().from(articles).where(eq(articles.id, articleId));
    if (!article) return null;

    const text = article.contentText ?? article.summary ?? article.title ?? '';
    if (!text) return null;

    try {
      return await client.summarize(text);
    } catch (err) {
      logger.error({ userId, articleId, error: err }, 'AI summarize failed');
      return null;
    }
  }

  async suggestTags(userId: string, articleId: string): Promise<string[]> {
    const logger = getLogger();
    const client = await this.getClient(userId);
    if (!client) return [];

    const db = getDb();
    const [article] = await db.select().from(articles).where(eq(articles.id, articleId));
    if (!article) return [];

    const userTags = await db
      .select({ name: tags.name })
      .from(tags)
      .where(eq(tags.userId, userId));

    const text = article.contentText ?? article.summary ?? article.title ?? '';
    if (!text) return [];

    try {
      return await client.suggestTags(text, userTags.map((t) => t.name));
    } catch (err) {
      logger.error({ userId, articleId, error: err }, 'AI suggest tags failed');
      return [];
    }
  }

  async generateBriefing(userId: string, articleData: { title: string; summary: string }[]): Promise<string | null> {
    const logger = getLogger();
    const client = await this.getClient(userId);
    if (!client) return null;

    try {
      return await client.generateBriefing(articleData);
    } catch (err) {
      logger.error({ userId, error: err }, 'AI briefing generation failed');
      return null;
    }
  }

  async updateUserAIConfig(userId: string, provider: AIProvider | null, apiKey: string | null) {
    const db = getDb();
    await db.update(users).set({
      aiProvider: provider,
      aiApiKeyEnc: apiKey ? this.encrypt(apiKey) : null,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
  }

  async getUserAIConfig(userId: string): Promise<{ provider: AIProvider | null; hasKey: boolean }> {
    const db = getDb();
    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, userId),
    });
    return {
      provider: (user?.aiProvider as AIProvider) ?? null,
      hasKey: !!user?.aiApiKeyEnc,
    };
  }

  private encrypt(text: string): string {
    const config = getConfig();
    const key = crypto.scryptSync(config.ENCRYPTION_KEY, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedText: string): string {
    const config = getConfig();
    const key = crypto.scryptSync(config.ENCRYPTION_KEY, 'salt', 32);
    const [ivHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

export const aiService = new AIService();
