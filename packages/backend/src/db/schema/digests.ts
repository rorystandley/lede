import { pgTable, uuid, integer, varchar, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { articles } from './articles.js';

export const digests = pgTable('digests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  articleCount: integer('article_count').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  contentJson: jsonb('content_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const digestArticles = pgTable('digest_articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  digestId: uuid('digest_id').notNull().references(() => digests.id, { onDelete: 'cascade' }),
  articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  aiSummary: varchar('ai_summary', { length: 2000 }),
});
