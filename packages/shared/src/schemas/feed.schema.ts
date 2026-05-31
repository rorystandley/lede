import { z } from 'zod';

export const subscribeFeedSchema = z.object({
  url: z.string().url(),
  folderId: z.string().uuid().optional(),
  customTitle: z.string().max(500).optional(),
});

export const updateSubscriptionSchema = z.object({
  folderId: z.string().uuid().nullable().optional(),
  customTitle: z.string().max(500).nullable().optional(),
  notify: z.boolean().optional(),
});

export const listFeedsQuerySchema = z.object({
  folderId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type SubscribeFeedInput = z.infer<typeof subscribeFeedSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
export type ListFeedsQuery = z.infer<typeof listFeedsQuerySchema>;
