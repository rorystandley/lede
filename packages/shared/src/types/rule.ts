import type { RuleMatchMode } from '../constants.js';

export interface RuleCondition {
  field: 'title' | 'content' | 'author' | 'url' | 'feed_id' | 'folder_id';
  op: 'contains' | 'not_contains' | 'equals' | 'not_equals' | 'matches_regex';
  value: string;
}

export interface RuleAction {
  type: 'tag' | 'star' | 'mark_read' | 'webhook' | 'mark_archived';
  tagId?: string;
  url?: string;
}

export interface Rule {
  id: string;
  userId: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
  matchMode: RuleMatchMode;
  runCount: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}
