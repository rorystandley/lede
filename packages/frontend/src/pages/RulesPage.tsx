import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rulesApi } from '../api/index.js';
import { useTags } from '../hooks/use-tags.js';
import { useFeeds } from '../hooks/use-feeds.js';
import type { RuleCondition, RuleAction, Rule } from '@lede/shared';

interface Props {
  onClose: () => void;
}

export function RulesPage({ onClose }: Props) {
  const qc = useQueryClient();
  const { data: rules } = useQuery({ queryKey: ['rules'], queryFn: rulesApi.list });
  const { data: tagsData } = useTags();
  const { data: feedsData } = useFeeds();
  const [editing, setEditing] = useState<'new' | string | null>(null);

  const deleteMut = useMutation({
    mutationFn: (id: string) => rulesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => rulesApi.update(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg border border-border shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Rules</h2>
          <div className="flex gap-2">
            <button onClick={() => setEditing('new')} className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded hover:bg-primary-700">
              New Rule
            </button>
            <button onClick={onClose} className="p-1 text-text-tertiary hover:text-text-primary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4">
          {editing && (
            <RuleEditor
              ruleId={editing === 'new' ? null : editing}
              tags={tagsData ?? []}
              feeds={feedsData?.items ?? []}
              onSave={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['rules'] }); }}
              onCancel={() => setEditing(null)}
            />
          )}

          {!editing && (
            <div className="space-y-3">
              {(rules ?? []).length === 0 && (
                <p className="text-sm text-text-tertiary text-center py-6">No rules yet. Create one to automate article processing.</p>
              )}
              {(rules ?? []).map((rule) => (
                <div key={rule.id} className="border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleMut.mutate({ id: rule.id, enabled: !rule.enabled })}
                        className={`w-8 h-4 rounded-full transition-colors relative ${rule.enabled ? 'bg-primary-500' : 'bg-surface-tertiary'}`}
                      >
                        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${rule.enabled ? 'left-4' : 'left-0.5'}`} />
                      </button>
                      <h3 className="text-sm font-medium text-text-primary">{rule.name}</h3>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => setEditing(rule.id)} className="text-xs text-text-secondary hover:text-text-primary">Edit</button>
                      <button onClick={() => deleteMut.mutate(rule.id)} className="text-xs text-red-500 hover:text-red-600">Delete</button>
                    </div>
                  </div>
                  <div className="text-xs text-text-secondary">
                    <span>{rule.conditions.length} condition{rule.conditions.length !== 1 ? 's' : ''}</span>
                    <span className="mx-1.5">|</span>
                    <span>{rule.actions.length} action{rule.actions.length !== 1 ? 's' : ''}</span>
                    <span className="mx-1.5">|</span>
                    <span>Match {rule.matchMode}</span>
                    {rule.runCount > 0 && <><span className="mx-1.5">|</span><span>Ran {rule.runCount} times</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleEditor({ ruleId, tags, feeds, onSave, onCancel }: {
  ruleId: string | null;
  tags: { id: string; name: string }[];
  feeds: { id: string; title: string | null; customTitle: string | null }[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [matchMode, setMatchMode] = useState<'all' | 'any'>('all');
  const [conditions, setConditions] = useState<RuleCondition[]>([{ field: 'title', op: 'contains', value: '' }]);
  const [actions, setActions] = useState<RuleAction[]>([{ type: 'star' }]);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || conditions.some((c) => !c.value && c.field !== 'feed_id')) return;
    setSaving(true);
    try {
      if (ruleId) {
        await rulesApi.update(ruleId, { name, matchMode, conditions, actions });
      } else {
        await rulesApi.create({ name, matchMode, conditions, actions });
      }
      onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-border rounded-lg p-4 mb-4 bg-surface-secondary">
      <h3 className="text-sm font-medium text-text-primary mb-3">{ruleId ? 'Edit Rule' : 'New Rule'}</h3>

      <div className="mb-3">
        <label className="block text-xs text-text-secondary mb-1">Rule Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Star AI articles"
          className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-500" />
      </div>

      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <label className="text-xs text-text-secondary">When</label>
          <select value={matchMode} onChange={(e) => setMatchMode(e.target.value as 'all' | 'any')}
            className="px-2 py-1 text-xs bg-surface border border-border rounded text-text-primary">
            <option value="all">all conditions match</option>
            <option value="any">any condition matches</option>
          </select>
        </div>
        {conditions.map((cond, i) => (
          <div key={i} className="flex gap-2 mb-1.5">
            <select value={cond.field} onChange={(e) => { const c = [...conditions]; c[i] = { ...c[i], field: e.target.value as RuleCondition['field'] }; setConditions(c); }}
              className="px-2 py-1 text-xs bg-surface border border-border rounded text-text-primary">
              <option value="title">Title</option>
              <option value="content">Content</option>
              <option value="author">Author</option>
              <option value="url">URL</option>
              <option value="feed_id">Feed</option>
            </select>
            <select value={cond.op} onChange={(e) => { const c = [...conditions]; c[i] = { ...c[i], op: e.target.value as RuleCondition['op'] }; setConditions(c); }}
              className="px-2 py-1 text-xs bg-surface border border-border rounded text-text-primary">
              <option value="contains">contains</option>
              <option value="not_contains">doesn't contain</option>
              <option value="equals">equals</option>
              <option value="matches_regex">matches regex</option>
            </select>
            {cond.field === 'feed_id' ? (
              <select value={cond.value} onChange={(e) => { const c = [...conditions]; c[i] = { ...c[i], value: e.target.value }; setConditions(c); }}
                className="flex-1 px-2 py-1 text-xs bg-surface border border-border rounded text-text-primary">
                <option value="">Select feed...</option>
                {feeds.map((f) => <option key={f.id} value={f.id}>{f.customTitle ?? f.title}</option>)}
              </select>
            ) : (
              <input type="text" value={cond.value} onChange={(e) => { const c = [...conditions]; c[i] = { ...c[i], value: e.target.value }; setConditions(c); }}
                placeholder="value..." className="flex-1 px-2 py-1 text-xs bg-surface border border-border rounded text-text-primary" />
            )}
            {conditions.length > 1 && (
              <button onClick={() => setConditions(conditions.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-500 text-xs">x</button>
            )}
          </div>
        ))}
        <button onClick={() => setConditions([...conditions, { field: 'title', op: 'contains', value: '' }])} className="text-xs text-primary-600 hover:underline">
          + Add condition
        </button>
      </div>

      <div className="mb-4">
        <label className="block text-xs text-text-secondary mb-2">Then:</label>
        {actions.map((action, i) => (
          <div key={i} className="flex gap-2 mb-1.5">
            <select value={action.type} onChange={(e) => { const a = [...actions]; a[i] = { type: e.target.value as RuleAction['type'] }; setActions(a); }}
              className="px-2 py-1 text-xs bg-surface border border-border rounded text-text-primary">
              <option value="star">Star article</option>
              <option value="mark_read">Mark as read</option>
              <option value="mark_archived">Archive</option>
              <option value="tag">Apply tag</option>
            </select>
            {action.type === 'tag' && (
              <select value={action.tagId ?? ''} onChange={(e) => { const a = [...actions]; a[i] = { ...a[i], tagId: e.target.value }; setActions(a); }}
                className="flex-1 px-2 py-1 text-xs bg-surface border border-border rounded text-text-primary">
                <option value="">Select tag...</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            {actions.length > 1 && (
              <button onClick={() => setActions(actions.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-500 text-xs">x</button>
            )}
          </div>
        ))}
        <button onClick={() => setActions([...actions, { type: 'star' }])} className="text-xs text-primary-600 hover:underline">
          + Add action
        </button>
      </div>

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Rule'}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-text-secondary border border-border rounded hover:bg-surface-tertiary">Cancel</button>
      </div>
    </div>
  );
}
