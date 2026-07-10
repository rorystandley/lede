import { pgTable, uuid, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { rules } from './rules.js';
import { articles } from './articles.js';

/**
 * Records which persistent noise filters matched an article for a user.
 * The rule's enabled flag remains the source of truth, so disabling or deleting
 * a filter immediately makes its articles visible again.
 */
export const filteredArticles = pgTable('filtered_articles', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ruleId: uuid('rule_id').notNull().references(() => rules.id, { onDelete: 'cascade' }),
  articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.ruleId, t.articleId] }),
  index('idx_filtered_articles_user_article').on(t.userId, t.articleId),
]);
