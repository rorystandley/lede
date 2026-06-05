import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { rules, articles, userArticleStates, feeds, userFeedSubscriptions } from '../db/schema/index.js';
import { tagService } from './tag.service.js';
import { getLogger } from '../lib/logger.js';
import type { RuleCondition, RuleAction, Rule } from '@lede/shared';

export class RuleService {
  async create(userId: string, data: {
    name: string;
    conditions: RuleCondition[];
    actions: RuleAction[];
    matchMode?: string;
    priority?: number;
  }) {
    const db = getDb();
    const [rule] = await db.insert(rules).values({
      userId,
      name: data.name,
      conditions: data.conditions,
      actions: data.actions,
      matchMode: data.matchMode ?? 'all',
      priority: data.priority ?? 0,
    }).returning();
    return this.toRule(rule);
  }

  async update(userId: string, ruleId: string, data: Partial<{
    name: string;
    enabled: boolean;
    conditions: RuleCondition[];
    actions: RuleAction[];
    matchMode: string;
    priority: number;
  }>) {
    const db = getDb();
    const [rule] = await db
      .update(rules)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(rules.id, ruleId), eq(rules.userId, userId)))
      .returning();
    if (!rule) throw new Error('Rule not found');
    return this.toRule(rule);
  }

  async delete(userId: string, ruleId: string) {
    const db = getDb();
    await db.delete(rules).where(and(eq(rules.id, ruleId), eq(rules.userId, userId)));
  }

  async listForUser(userId: string): Promise<Rule[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(rules)
      .where(eq(rules.userId, userId))
      .orderBy(rules.priority, rules.name);
    return rows.map((r) => this.toRule(r));
  }

  async evaluateForArticle(userId: string, articleId: string) {
    const logger = getLogger();
    const db = getDb();

    const enabledRules = await db
      .select()
      .from(rules)
      .where(and(eq(rules.userId, userId), eq(rules.enabled, true)))
      .orderBy(rules.priority);

    if (enabledRules.length === 0) return;

    const [article] = await db.select().from(articles).where(eq(articles.id, articleId));
    if (!article) return;

    const [feed] = await db.select().from(feeds).where(eq(feeds.id, article.feedId));

    const sub = await db.query.userFeedSubscriptions.findFirst({
      where: (ufs, { and, eq }) => and(eq(ufs.userId, userId), eq(ufs.feedId, article.feedId)),
    });

    for (const rule of enabledRules) {
      const conditions = rule.conditions as RuleCondition[];
      const actions = rule.actions as RuleAction[];
      const matchMode = rule.matchMode as 'all' | 'any';

      const matches = conditions.map((c) => this.evaluateCondition(c, article, feed, sub));
      const ruleMatches = matchMode === 'all' ? matches.every(Boolean) : matches.some(Boolean);

      if (ruleMatches) {
        logger.info({ ruleId: rule.id, articleId, ruleName: rule.name }, 'Rule matched');
        await this.executeActions(userId, articleId, actions, rule.id);
        await db.update(rules).set({
          runCount: rule.runCount + 1,
          lastRunAt: new Date(),
        }).where(eq(rules.id, rule.id));
      }
    }
  }

  private evaluateCondition(
    condition: RuleCondition,
    article: typeof articles.$inferSelect,
    feed: typeof feeds.$inferSelect | undefined,
    sub: { folderId: string | null } | undefined,
  ): boolean {
    let value: string;
    switch (condition.field) {
      case 'title':
        value = article.title ?? '';
        break;
      case 'content':
        value = article.contentText ?? article.summary ?? '';
        break;
      case 'author':
        value = article.author ?? '';
        break;
      case 'url':
        value = article.url ?? '';
        break;
      case 'feed_id':
        value = article.feedId;
        break;
      case 'folder_id':
        value = sub?.folderId ?? '';
        break;
      default:
        return false;
    }

    switch (condition.op) {
      case 'contains':
        return value.toLowerCase().includes(condition.value.toLowerCase());
      case 'not_contains':
        return !value.toLowerCase().includes(condition.value.toLowerCase());
      case 'equals':
        return value.toLowerCase() === condition.value.toLowerCase();
      case 'not_equals':
        return value.toLowerCase() !== condition.value.toLowerCase();
      case 'matches_regex':
        try {
          return new RegExp(condition.value, 'i').test(value);
        } catch {
          return false;
        }
      default:
        return false;
    }
  }

  private async executeActions(userId: string, articleId: string, actions: RuleAction[], ruleId: string) {
    const db = getDb();

    for (const action of actions) {
      switch (action.type) {
        case 'tag':
          if (action.tagId) {
            await tagService.addTagToArticle(userId, articleId, action.tagId, 'rule');
          }
          break;
        case 'star':
          await db
            .insert(userArticleStates)
            .values({ userId, articleId, isStarred: true })
            .onConflictDoUpdate({
              target: [userArticleStates.userId, userArticleStates.articleId],
              set: { isStarred: true, updatedAt: new Date() },
            });
          break;
        case 'mark_read':
          await db
            .insert(userArticleStates)
            .values({ userId, articleId, isRead: true, readAt: new Date() })
            .onConflictDoUpdate({
              target: [userArticleStates.userId, userArticleStates.articleId],
              set: { isRead: true, readAt: new Date(), updatedAt: new Date() },
            });
          break;
        case 'mark_archived':
          await db
            .insert(userArticleStates)
            .values({ userId, articleId, isArchived: true })
            .onConflictDoUpdate({
              target: [userArticleStates.userId, userArticleStates.articleId],
              set: { isArchived: true, updatedAt: new Date() },
            });
          break;
        case 'webhook':
          if (action.url) {
            await this.executeWebhook(action.url, { articleId, userId, action: 'rule_match' }, ruleId);
          }
          break;
      }
    }
  }

  /** Strip query params from a URL so secrets are not logged. */
  private sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.search = '';
      return parsed.toString();
    } catch {
      return '<invalid-url>';
    }
  }

  /**
   * Fire a webhook with a 10-second timeout and up to 2 retries
   * (exponential backoff: 1 s, then 4 s).
   */
  private async executeWebhook(url: string, payload: Record<string, unknown>, ruleId: string) {
    const logger = getLogger();
    const maxAttempts = 3;
    const backoffMs = [1_000, 4_000]; // delays before retry 2 and 3
    const sanitizedUrl = this.sanitizeUrl(url);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        });

        if (res.ok) {
          logger.debug({ ruleId, url: sanitizedUrl, status: res.status, attempt }, 'Webhook delivered');
          return;
        }

        // Non-2xx — treat as a retriable failure
        if (attempt < maxAttempts) {
          logger.debug({ ruleId, url: sanitizedUrl, status: res.status, attempt }, 'Webhook returned non-2xx, retrying');
          await this.sleep(backoffMs[attempt - 1]);
        } else {
          logger.warn(
            { ruleId, url: sanitizedUrl, status: res.status, attempt },
            `Webhook failed after ${maxAttempts} attempts: HTTP ${res.status}`,
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (attempt < maxAttempts) {
          logger.debug({ ruleId, url: sanitizedUrl, error: message, attempt }, 'Webhook request error, retrying');
          await this.sleep(backoffMs[attempt - 1]);
        } else {
          logger.warn(
            { ruleId, url: sanitizedUrl, error: message, attempt },
            `Webhook failed after ${maxAttempts} attempts: ${message}`,
          );
        }
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private toRule(row: typeof rules.$inferSelect): Rule {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      enabled: row.enabled,
      priority: row.priority,
      conditions: row.conditions as RuleCondition[],
      actions: row.actions as RuleAction[],
      matchMode: row.matchMode as 'all' | 'any',
      runCount: row.runCount,
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export const ruleService = new RuleService();
