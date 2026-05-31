import { eq, and, sql, desc, gte } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { users, articles, tags, aiUsageLog } from '../db/schema/index.js';
import { createAIClient, type AIClient, type AIUsage } from '../lib/ai-client.js';
import { getLogger } from '../lib/logger.js';
import { aiCalls, aiTokensUsed } from '../lib/metrics.js';
import { getConfig } from '../config.js';
import crypto from 'node:crypto';
import type { AIProvider } from '@news-reader/shared';

export class AIService {
  private async getClient(userId: string): Promise<{ client: AIClient; provider: AIProvider } | null> {
    const db = getDb();
    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, userId),
    });

    if (!user?.aiProvider || !user?.aiApiKeyEnc) return null;

    const apiKey = this.decrypt(user.aiApiKeyEnc);
    return { client: createAIClient(user.aiProvider as AIProvider, apiKey), provider: user.aiProvider as AIProvider };
  }

  private async logUsage(userId: string, provider: AIProvider, operation: string, usage: AIUsage) {
    const db = getDb();
    await db.insert(aiUsageLog).values({
      userId,
      provider,
      model: usage.model,
      operation,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimatedCostUsd: usage.estimatedCostUsd.toFixed(6),
    });
    aiCalls.inc({ provider, operation, status: 'success' });
    aiTokensUsed.inc({ provider, kind: 'input' }, usage.inputTokens);
    aiTokensUsed.inc({ provider, kind: 'output' }, usage.outputTokens);
  }

  async summarize(userId: string, articleId: string): Promise<string | null> {
    const logger = getLogger();
    const ctx = await this.getClient(userId);
    if (!ctx) return null;

    const db = getDb();
    const [article] = await db.select().from(articles).where(eq(articles.id, articleId));
    if (!article) return null;

    const text = article.contentText ?? article.summary ?? article.title ?? '';
    if (!text) return null;

    try {
      const { result, usage } = await ctx.client.summarize(text);
      await this.logUsage(userId, ctx.provider, 'summarize', usage);
      return result;
    } catch (err) {
      logger.error({ userId, articleId, error: err }, 'AI summarize failed');
      return null;
    }
  }

  async suggestTags(userId: string, articleId: string): Promise<string[]> {
    const logger = getLogger();
    const ctx = await this.getClient(userId);
    if (!ctx) return [];

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
      const { result, usage } = await ctx.client.suggestTags(text, userTags.map((t) => t.name));
      await this.logUsage(userId, ctx.provider, 'suggest_tags', usage);
      return result;
    } catch (err) {
      logger.error({ userId, articleId, error: err }, 'AI suggest tags failed');
      return [];
    }
  }

  async generateBriefing(userId: string, articleData: { title: string; summary: string }[]): Promise<string | null> {
    const logger = getLogger();
    const ctx = await this.getClient(userId);
    if (!ctx) return null;

    try {
      const { result, usage } = await ctx.client.generateBriefing(articleData);
      await this.logUsage(userId, ctx.provider, 'briefing', usage);
      return result;
    } catch (err) {
      logger.error({ userId, error: err }, 'AI briefing generation failed');
      return null;
    }
  }

  async getUsageStats(userId: string) {
    const db = getDb();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const monthlyRow = await db
      .select({
        totalCalls: sql<number>`count(*)::int`,
        totalInputTokens: sql<number>`coalesce(sum(${aiUsageLog.inputTokens}), 0)::int`,
        totalOutputTokens: sql<number>`coalesce(sum(${aiUsageLog.outputTokens}), 0)::int`,
        totalCostUsd: sql<number>`coalesce(sum(${aiUsageLog.estimatedCostUsd}), 0)::float`,
      })
      .from(aiUsageLog)
      .where(and(eq(aiUsageLog.userId, userId), gte(aiUsageLog.createdAt, monthStart)));

    const todayRow = await db
      .select({
        totalCalls: sql<number>`count(*)::int`,
        totalCostUsd: sql<number>`coalesce(sum(${aiUsageLog.estimatedCostUsd}), 0)::float`,
      })
      .from(aiUsageLog)
      .where(and(eq(aiUsageLog.userId, userId), gte(aiUsageLog.createdAt, dayStart)));

    const byOperation = await db
      .select({
        operation: aiUsageLog.operation,
        count: sql<number>`count(*)::int`,
        costUsd: sql<number>`coalesce(sum(${aiUsageLog.estimatedCostUsd}), 0)::float`,
      })
      .from(aiUsageLog)
      .where(and(eq(aiUsageLog.userId, userId), gte(aiUsageLog.createdAt, monthStart)))
      .groupBy(aiUsageLog.operation);

    const recent = await db
      .select()
      .from(aiUsageLog)
      .where(eq(aiUsageLog.userId, userId))
      .orderBy(desc(aiUsageLog.createdAt))
      .limit(10);

    return {
      today: { calls: todayRow[0].totalCalls, costUsd: todayRow[0].totalCostUsd },
      thisMonth: {
        calls: monthlyRow[0].totalCalls,
        inputTokens: monthlyRow[0].totalInputTokens,
        outputTokens: monthlyRow[0].totalOutputTokens,
        costUsd: monthlyRow[0].totalCostUsd,
      },
      byOperation,
      recent: recent.map((r) => ({
        id: r.id,
        operation: r.operation,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        costUsd: Number(r.estimatedCostUsd),
        createdAt: r.createdAt.toISOString(),
      })),
    };
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
