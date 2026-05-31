import { api } from './client.js';
import type { Rule, CreateRuleInput, UpdateRuleInput } from '@news-reader/shared';

export const rulesApi = {
  list: () => api.get<Rule[]>('/rules'),

  create: (data: CreateRuleInput) =>
    api.post<Rule>('/rules', data),

  update: (ruleId: string, data: UpdateRuleInput) =>
    api.patch<Rule>(`/rules/${ruleId}`, data),

  delete: (ruleId: string) =>
    api.delete(`/rules/${ruleId}`),
};
