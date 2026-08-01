import { z } from 'zod';
import { RULE_MATCH_MODES } from '../constants.js';

const ruleConditionSchema = z.object({
  field: z.enum(['title', 'content', 'author', 'url', 'feed_id', 'folder_id']),
  op: z.enum(['contains', 'not_contains', 'equals', 'not_equals', 'matches_regex']),
  value: z.string(),
});

const ruleActionSchema = z.object({
  type: z.enum(['tag', 'star', 'mark_read', 'webhook', 'mark_archived', 'hide']),
  tagId: z.string().uuid().optional(),
  url: z.string().url().optional(),
});

export const createRuleSchema = z.object({
  name: z.string().min(1).max(200),
  conditions: z.array(ruleConditionSchema).min(1),
  actions: z.array(ruleActionSchema).min(1),
  matchMode: z.enum(RULE_MATCH_MODES).default('all'),
  priority: z.number().int().default(0),
});

export const updateRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
  conditions: z.array(ruleConditionSchema).min(1).optional(),
  actions: z.array(ruleActionSchema).min(1).optional(),
  matchMode: z.enum(RULE_MATCH_MODES).optional(),
  priority: z.number().int().optional(),
});

export type CreateRuleInput = z.input<typeof createRuleSchema>;
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;
