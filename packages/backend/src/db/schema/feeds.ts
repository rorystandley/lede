import { pgTable, uuid, varchar, text, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { folders } from './folders.js';

export const feeds = pgTable('feeds', {
  id: uuid('id').primaryKey().defaultRandom(),
  url: text('url').notNull().unique(),
  title: varchar('title', { length: 500 }),
  description: text('description'),
  siteUrl: text('site_url'),
  faviconUrl: text('favicon_url'),
  feedType: varchar('feed_type', { length: 20 }).notNull().default('rss'),
  lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
  lastError: text('last_error'),
  errorCount: integer('error_count').notNull().default(0),
  refreshInterval: integer('refresh_interval').notNull().default(60),
  etag: varchar('etag', { length: 255 }),
  lastModified: varchar('last_modified', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userFeedSubscriptions = pgTable('user_feed_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  feedId: uuid('feed_id').notNull().references(() => feeds.id, { onDelete: 'cascade' }),
  folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
  customTitle: varchar('custom_title', { length: 500 }),
  notify: integer('notify').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('uq_user_feed').on(t.userId, t.feedId),
]);
