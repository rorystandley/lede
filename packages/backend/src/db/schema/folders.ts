import { pgTable, uuid, varchar, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const folders = pgTable('folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  parentId: uuid('parent_id'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('uq_folder_name').on(t.userId, t.name, t.parentId),
]);
