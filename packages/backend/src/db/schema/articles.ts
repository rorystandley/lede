import { pgTable, uuid, text, varchar, integer, timestamp, boolean, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { feeds } from './feeds.js';

export const articles = pgTable('articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  feedId: uuid('feed_id').notNull().references(() => feeds.id, { onDelete: 'cascade' }),
  guid: text('guid').notNull(),
  url: text('url'),
  title: text('title'),
  author: varchar('author', { length: 500 }),
  summary: text('summary'),
  contentHtml: text('content_html'),
  contentText: text('content_text'),
  imageUrl: text('image_url'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  wordCount: integer('word_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('uq_feed_guid').on(t.feedId, t.guid),
  index('idx_articles_feed_published').on(t.feedId, t.publishedAt),
  index('idx_articles_published').on(t.publishedAt),
  index('idx_articles_content_search').using(
    'gin',
    sql`to_tsvector('english', coalesce(${t.title}, '') || ' ' || coalesce(${t.contentText}, ''))`
  ),
]);

export const userArticleStates = pgTable('user_article_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  isRead: boolean('is_read').notNull().default(false),
  isStarred: boolean('is_starred').notNull().default(false),
  isArchived: boolean('is_archived').notNull().default(false),
  readAt: timestamp('read_at', { withTimezone: true }),
  readingTimeMs: integer('reading_time_ms').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('uq_user_article').on(t.userId, t.articleId),
  index('idx_user_article_read').on(t.userId, t.isRead),
  index('idx_user_article_starred').on(t.userId, t.isStarred),
]);
