import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { rulesApi } from '../../api/rules.api.js';
import { useFeeds } from '../../hooks/use-feeds.js';
import { useFolders } from '../../hooks/use-folders.js';
import type { FolderWithCounts, Rule, RuleCondition } from '@lede/shared';

type ScopeType = 'all' | 'feed' | 'folder';

function isNoiseFilter(rule: Rule) {
  return rule.actions.some((action) => action.type === 'hide');
}

function flattenFolders(folders: FolderWithCounts[]): FolderWithCounts[] {
  return folders.flatMap((folder) => [folder, ...flattenFolders(folder.children)]);
}

function describeCondition(condition: RuleCondition, feeds: { id: string; title: string | null; customTitle: string | null }[], folders: FolderWithCounts[]) {
  if (condition.field === 'feed_id') {
    const feed = feeds.find((item) => item.id === condition.value);
    return `Feed is ${feed?.customTitle ?? feed?.title ?? 'Unknown feed'}`;
  }
  if (condition.field === 'folder_id') {
    return `Folder is ${folders.find((item) => item.id === condition.value)?.name ?? 'Unknown folder'}`;
  }
  const operator = {
    contains: 'contains',
    not_contains: "doesn't contain",
    equals: 'equals',
    not_equals: "doesn't equal",
    matches_regex: 'matches regex',
  }[condition.op];
  return `${condition.field[0].toUpperCase() + condition.field.slice(1)} ${operator} “${condition.value}”`;
}

export function NoiseFiltersSection() {
  const qc = useQueryClient();
  const { data: rules = [], isLoading } = useQuery({ queryKey: ['rules'], queryFn: rulesApi.list });
  const { data: feedsData } = useFeeds();
  const { data: folderTree = [] } = useFolders();
  const [editing, setEditing] = useState<'new' | string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const feeds = feedsData?.items ?? [];
  const folders = flattenFolders(folderTree);
  const filters = rules.filter(isNoiseFilter);
  const editingRule = editing && editing !== 'new' ? filters.find((filter) => filter.id === editing) : undefined;

  const refreshVisibleArticles = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['rules'] }),
      qc.invalidateQueries({ queryKey: ['articles-infinite'] }),
      qc.invalidateQueries({ queryKey: ['search'] }),
      qc.invalidateQueries({ queryKey: ['feeds'] }),
      qc.invalidateQueries({ queryKey: ['folders'] }),
      qc.invalidateQueries({ queryKey: ['digests'] }),
    ]);
  };

  const handleToggle = async (filter: Rule) => {
    const enabled = !filter.enabled;
    await rulesApi.update(filter.id, { enabled });
    const result = enabled ? await rulesApi.run(filter.id) : null;
    setStatus(enabled ? `${result?.matched ?? 0} current articles hidden.` : `“${filter.name}” is off. Its articles are visible again.`);
    await refreshVisibleArticles();
  };

  const handleDelete = async (filter: Rule) => {
    if (!window.confirm(`Delete “${filter.name}”? Articles hidden only by this filter will reappear.`)) return;
    await rulesApi.delete(filter.id);
    setStatus(`“${filter.name}” deleted.`);
    await refreshVisibleArticles();
  };

  return (
    <div className="p-4">
      <div className="mb-5">
        <h3 className="text-sm font-medium text-text-primary">Noise filters</h3>
        <p className="mt-1 text-xs leading-5 text-text-secondary">
          Permanently sift unwanted articles out of your feed. Filters apply to existing articles and every new article until you turn them off.
        </p>
      </div>

      {status && (
        <div role="status" className="mb-4 rounded border border-primary-200 bg-primary-50 px-3 py-2 text-xs text-primary-700 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-300">
          {status}
        </div>
      )}

      {editing ? (
        <NoiseFilterEditor
          key={editing}
          rule={editingRule}
          feeds={feeds}
          folders={folders}
          onCancel={() => setEditing(null)}
          onSaved={async (message) => {
            setEditing(null);
            setStatus(message);
            await refreshVisibleArticles();
          }}
        />
      ) : (
        <>
          <button
            onClick={() => setEditing('new')}
            className="mb-4 rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
          >
            Add noise filter
          </button>

          {isLoading && <p className="py-6 text-center text-xs text-text-tertiary">Loading filters…</p>}
          {!isLoading && filters.length === 0 && (
            <div className="rounded-lg border border-dashed border-border px-4 py-7 text-center">
              <p className="text-sm text-text-primary">No noise filters yet</p>
              <p className="mt-1 text-xs text-text-tertiary">Add one for recurring topics, authors, or URL patterns you never want in your feed.</p>
            </div>
          )}

          <div className="space-y-3">
            {filters.map((filter) => (
              <div key={filter.id} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={filter.enabled}
                        aria-label={`${filter.enabled ? 'Turn off' : 'Turn on'} ${filter.name}`}
                        onClick={() => void handleToggle(filter)}
                        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${filter.enabled ? 'bg-primary-500' : 'bg-surface-tertiary'}`}
                      >
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${filter.enabled ? 'left-4.5' : 'left-0.5'}`} />
                      </button>
                      <h4 className="truncate text-sm font-medium text-text-primary">{filter.name}</h4>
                    </div>
                    <p className="mt-2 text-xs text-text-secondary">
                      Match {filter.matchMode === 'all' ? 'all' : 'any'}: {filter.conditions.map((condition) => describeCondition(condition, feeds, folders)).join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => setEditing(filter.id)} className="text-xs text-text-secondary hover:text-text-primary">Edit</button>
                    <button onClick={() => void handleDelete(filter)} className="text-xs text-red-500 hover:text-red-600">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NoiseFilterEditor({ rule, feeds, folders, onCancel, onSaved }: {
  rule?: Rule;
  feeds: { id: string; title: string | null; customTitle: string | null }[];
  folders: FolderWithCounts[];
  onCancel: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const scopeCondition = rule?.conditions.find((condition) => condition.field === 'feed_id' || condition.field === 'folder_id');
  const initialCriteria = rule?.conditions.filter((condition) => condition.field !== 'feed_id' && condition.field !== 'folder_id');
  const [name, setName] = useState(rule?.name ?? '');
  const [scopeType, setScopeType] = useState<ScopeType>(scopeCondition?.field === 'feed_id' ? 'feed' : scopeCondition?.field === 'folder_id' ? 'folder' : 'all');
  const [scopeId, setScopeId] = useState(scopeCondition?.value ?? '');
  const [matchMode, setMatchMode] = useState<'all' | 'any'>(rule?.matchMode ?? 'all');
  const [conditions, setConditions] = useState<RuleCondition[]>(initialCriteria?.length ? initialCriteria : [{ field: 'title', op: 'contains', value: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateCondition = (index: number, update: Partial<RuleCondition>) => {
    setConditions((current) => current.map((condition, i) => i === index ? { ...condition, ...update } : condition));
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) return setError('Give this filter a name.');
    if ((scopeType === 'feed' || scopeType === 'folder') && !scopeId) return setError('Choose where this filter applies.');
    if (conditions.some((condition) => !condition.value.trim())) return setError('Every condition needs a value.');
    const invalidRegex = conditions.find((condition) => {
      if (condition.op !== 'matches_regex') return false;
      try { new RegExp(condition.value); return false; } catch { return true; }
    });
    if (invalidRegex) return setError('Enter a valid regular expression.');

    const scopedConditions: RuleCondition[] = [
      ...(scopeType === 'feed' ? [{ field: 'feed_id', op: 'equals', value: scopeId } as RuleCondition] : []),
      ...(scopeType === 'folder' ? [{ field: 'folder_id', op: 'equals', value: scopeId } as RuleCondition] : []),
      ...conditions,
    ];

    setSaving(true);
    try {
      const saved = rule
        ? await rulesApi.update(rule.id, { name: name.trim(), conditions: scopedConditions, actions: [{ type: 'hide' }], matchMode })
        : await rulesApi.create({ name: name.trim(), conditions: scopedConditions, actions: [{ type: 'hide' }], matchMode });
      const result = await rulesApi.run(saved.id);
      await onSaved(`“${saved.name}” saved. ${result.matched} current articles hidden.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this filter.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface-secondary p-4">
      <h4 className="mb-4 text-sm font-medium text-text-primary">{rule ? 'Edit noise filter' : 'New noise filter'}</h4>

      <label className="mb-3 block">
        <span className="mb-1 block text-xs text-text-secondary">Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Hide sponsored posts" className="w-full rounded border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary" />
      </label>

      <div className="mb-3">
        <label className="mb-1 block text-xs text-text-secondary">Apply to</label>
        <div className="flex gap-2">
          <select value={scopeType} onChange={(event) => { setScopeType(event.target.value as ScopeType); setScopeId(''); }} className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-primary">
            <option value="all">All feeds</option>
            <option value="feed">One feed</option>
            <option value="folder">One folder</option>
          </select>
          {scopeType === 'feed' && (
            <select aria-label="Feed" value={scopeId} onChange={(event) => setScopeId(event.target.value)} className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-primary">
              <option value="">Choose feed…</option>
              {feeds.map((feed) => <option key={feed.id} value={feed.id}>{feed.customTitle ?? feed.title}</option>)}
            </select>
          )}
          {scopeType === 'folder' && (
            <select aria-label="Folder" value={scopeId} onChange={(event) => setScopeId(event.target.value)} className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-primary">
              <option value="">Choose folder…</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs text-text-secondary">Hide articles when</span>
          <select aria-label="Condition matching" value={matchMode} onChange={(event) => setMatchMode(event.target.value as 'all' | 'any')} className="rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary">
            <option value="all">all conditions match</option>
            <option value="any">any condition matches</option>
          </select>
        </div>

        <div className="space-y-2">
          {conditions.map((condition, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:grid-cols-[9rem_9rem_minmax(0,1fr)_auto]">
              <select aria-label={`Field ${index + 1}`} value={condition.field} onChange={(event) => updateCondition(index, { field: event.target.value as RuleCondition['field'] })} className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-primary">
                <option value="title">Title</option>
                <option value="content">Content</option>
                <option value="author">Author</option>
                <option value="url">URL</option>
              </select>
              <select aria-label={`Operator ${index + 1}`} value={condition.op} onChange={(event) => updateCondition(index, { op: event.target.value as RuleCondition['op'] })} className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-primary">
                <option value="contains">contains</option>
                <option value="not_contains">doesn't contain</option>
                <option value="equals">equals</option>
                <option value="not_equals">doesn't equal</option>
                <option value="matches_regex">matches regex</option>
              </select>
              <input aria-label={`Value ${index + 1}`} value={condition.value} onChange={(event) => updateCondition(index, { value: event.target.value })} placeholder="keyword, phrase, or pattern" className="col-span-2 min-w-0 rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-primary sm:col-span-1" />
              {conditions.length > 1 && <button aria-label={`Remove condition ${index + 1}`} onClick={() => setConditions((current) => current.filter((_, i) => i !== index))} className="text-xs text-red-500">Remove</button>}
            </div>
          ))}
        </div>
        <button onClick={() => setConditions((current) => [...current, { field: 'title', op: 'contains', value: '' }])} className="mt-2 text-xs text-primary-600 hover:underline">+ Add condition</button>
      </div>

      {error && <p role="alert" className="mb-3 text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => void handleSave()} disabled={saving} className="rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50">{saving ? 'Applying…' : 'Save and apply'}</button>
        <button onClick={onCancel} className="rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-tertiary">Cancel</button>
      </div>
    </div>
  );
}
