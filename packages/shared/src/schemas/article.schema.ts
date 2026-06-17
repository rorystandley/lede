import { z } from 'zod';

/**
 * Boolean query parameter. Values arrive as strings, so `z.coerce.boolean()`
 * cannot be used: it runs `Boolean(value)`, and `Boolean("false") === true`
 * (any non-empty string is truthy), which silently turns `?isRead=false` into
 * `true`. Parse the literal strings instead (also accepting a real boolean for
 * programmatic callers).
 */
const queryBoolean = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true');

export const listArticlesQuerySchema = z.object({
  feedId: z.string().uuid().optional(),
  folderId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  isRead: queryBoolean.optional(),
  isStarred: queryBoolean.optional(),
  isArchived: queryBoolean.optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['published_at', 'created_at']).default('published_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const markArticlesReadSchema = z.object({
  articleIds: z.array(z.string().uuid()).min(1).max(1000),
});

export const starArticleSchema = z.object({
  isStarred: z.boolean(),
});

export const archiveArticleSchema = z.object({
  isArchived: z.boolean(),
});

export const tagArticleSchema = z.object({
  tagIds: z.array(z.string().uuid()),
});

export const searchArticlesQuerySchema = z.object({
  q: z.string().min(1).max(500),
  feedId: z.string().uuid().optional(),
  folderId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListArticlesQuery = z.infer<typeof listArticlesQuerySchema>;
export type MarkArticlesReadInput = z.infer<typeof markArticlesReadSchema>;
export type StarArticleInput = z.infer<typeof starArticleSchema>;
export type ArchiveArticleInput = z.infer<typeof archiveArticleSchema>;
export type TagArticleInput = z.infer<typeof tagArticleSchema>;
export type SearchArticlesQuery = z.infer<typeof searchArticlesQuerySchema>;
