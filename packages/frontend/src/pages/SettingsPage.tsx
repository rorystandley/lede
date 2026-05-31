import { useState, useRef, useEffect } from 'react';
import { opmlApi, aiApi } from '../api/index.js';
import { userApi } from '../api/user.api.js';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import type { AIProvider } from '@news-reader/shared';

interface Props {
  onClose: () => void;
}

export function SettingsPage({ onClose }: Props) {
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  // AI config
  const { data: aiConfig } = useQuery({
    queryKey: ['ai-config'],
    queryFn: aiApi.getConfig,
  });
  const [aiProvider, setAiProvider] = useState<AIProvider | ''>('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiSaving, setAiSaving] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);

  useEffect(() => {
    if (aiConfig) {
      setAiProvider(aiConfig.provider ?? '');
    }
  }, [aiConfig]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportStatus(null);
    try {
      const text = await file.text();
      const result = await opmlApi.importOpml(text);
      setImportStatus(`Imported ${result.imported} feeds. ${result.failed > 0 ? `${result.failed} failed.` : ''}`);
      qc.invalidateQueries({ queryKey: ['feeds'] });
      qc.invalidateQueries({ queryKey: ['folders'] });
    } catch (err) {
      setImportStatus(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleExport = async () => {
    try {
      const opml = await opmlApi.exportOpml();
      const blob = new Blob([opml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'news-reader-export.opml';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed');
    }
  };

  const handleSaveAI = async () => {
    setAiSaving(true);
    setAiStatus(null);
    try {
      const provider = aiProvider || null;
      const key = aiApiKey.trim() || null;
      await aiApi.updateConfig(provider as AIProvider | null, key);
      setAiStatus('AI configuration saved');
      setAiApiKey('');
      qc.invalidateQueries({ queryKey: ['ai-config'] });
    } catch (err) {
      setAiStatus(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setAiSaving(false);
    }
  };

  const handleRemoveAI = async () => {
    setAiSaving(true);
    try {
      await aiApi.updateConfig(null, null);
      setAiProvider('');
      setAiApiKey('');
      setAiStatus('AI configuration removed');
      qc.invalidateQueries({ queryKey: ['ai-config'] });
    } finally {
      setAiSaving(false);
    }
  };

  // Profile
  const { data: profile } = useQuery({ queryKey: ['user-profile'], queryFn: userApi.getProfile });
  const [digestSchedule, setDigestSchedule] = useState('07:00');
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [timezone, setTimezone] = useState('');

  useEffect(() => {
    if (profile) {
      setDigestSchedule(profile.digestSchedule);
      setDigestEnabled(profile.digestEnabled);
      setTimezone(profile.timezone);
    }
  }, [profile]);

  const profileMut = useMutation({
    mutationFn: (data: Parameters<typeof userApi.updateProfile>[0]) => userApi.updateProfile(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-profile'] }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg border border-border shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
          <button onClick={onClose} className="p-1 text-text-tertiary hover:text-text-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Digest & Profile */}
          <section>
            <h3 className="text-sm font-medium text-text-primary mb-3">Morning Digest</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs text-text-secondary">Enable daily digest</label>
                <button
                  onClick={() => {
                    const next = !digestEnabled;
                    setDigestEnabled(next);
                    profileMut.mutate({ digestEnabled: next });
                  }}
                  className={`w-9 h-5 rounded-full transition-colors relative ${digestEnabled ? 'bg-primary-500' : 'bg-surface-tertiary'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${digestEnabled ? 'left-4.5' : 'left-0.5'}`} />
                </button>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Delivery time</label>
                <div className="flex gap-2">
                  <input
                    type="time"
                    value={digestSchedule}
                    onChange={(e) => setDigestSchedule(e.target.value)}
                    className="px-2.5 py-1.5 text-sm bg-surface border border-border rounded text-text-primary"
                  />
                  <button
                    onClick={() => profileMut.mutate({ digestSchedule })}
                    disabled={profileMut.isPending}
                    className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Timezone</label>
                <div className="flex gap-2">
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-sm bg-surface border border-border rounded text-text-primary"
                  >
                    {Intl.supportedValuesOf('timeZone').filter((tz) => tz.includes('/')).slice(0, 100).map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => profileMut.mutate({ timezone })}
                    disabled={profileMut.isPending}
                    className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* AI Configuration */}
          <section>
            <h3 className="text-sm font-medium text-text-primary mb-3">AI Configuration (BYOAI)</h3>
            <p className="text-xs text-text-secondary mb-3">
              Bring your own API key to enable AI summaries, tag suggestions, and smart briefings.
            </p>

            {aiConfig?.hasKey && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-green-50 dark:bg-green-900/20 rounded text-xs text-green-700 dark:text-green-300">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                AI configured: {aiConfig.provider}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Provider</label>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value as AIProvider | '')}
                  className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border rounded text-text-primary"
                >
                  <option value="">None (AI disabled)</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI (GPT)</option>
                </select>
              </div>
              {aiProvider && (
                <div>
                  <label className="block text-xs text-text-secondary mb-1">
                    API Key {aiConfig?.hasKey && '(leave empty to keep existing)'}
                  </label>
                  <input
                    type="password"
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                    placeholder={aiConfig?.hasKey ? '••••••••' : 'Enter your API key'}
                    className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleSaveAI}
                  disabled={aiSaving || (!aiProvider && !aiConfig?.hasKey)}
                  className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                >
                  {aiSaving ? 'Saving...' : 'Save'}
                </button>
                {aiConfig?.hasKey && (
                  <button
                    onClick={handleRemoveAI}
                    disabled={aiSaving}
                    className="px-3 py-1.5 text-xs text-red-500 border border-red-300 dark:border-red-800 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Remove AI
                  </button>
                )}
              </div>
              {aiStatus && <p className="text-xs text-primary-600">{aiStatus}</p>}
            </div>
          </section>

          {/* AI Usage */}
          {aiConfig?.hasKey && <AIUsageSection />}

          {/* OPML */}
          <section>
            <h3 className="text-sm font-medium text-text-primary mb-3">OPML Import / Export</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Import feeds from an OPML file</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".opml,.xml"
                  onChange={handleImport}
                  disabled={importing}
                  className="block w-full text-sm text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-900/30 dark:file:text-primary-300"
                />
                {importing && <p className="text-xs text-text-tertiary mt-1">Importing...</p>}
                {importStatus && <p className="text-xs mt-1 text-primary-600">{importStatus}</p>}
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Export your feeds as OPML</label>
                <button onClick={handleExport} className="px-3 py-1.5 text-xs font-medium bg-surface-tertiary text-text-primary rounded hover:bg-border">
                  Export OPML
                </button>
              </div>
            </div>
          </section>

          {/* MCP */}
          <section>
            <h3 className="text-sm font-medium text-text-primary mb-3">MCP Server (AI Agent Access)</h3>
            <p className="text-xs text-text-secondary mb-2">
              Connect AI agents to your news reader via the Model Context Protocol.
            </p>
            <div className="bg-surface-tertiary rounded p-3">
              <p className="text-xs font-mono text-text-secondary">Endpoint: <span className="text-text-primary">{window.location.origin}/mcp</span></p>
              <p className="text-xs text-text-tertiary mt-1">Authenticate with your API key as a Bearer token.</p>
            </div>
          </section>

          {/* Keyboard Shortcuts */}
          <section>
            <h3 className="text-sm font-medium text-text-primary mb-3">Keyboard Shortcuts</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                ['j / k', 'Navigate articles'],
                ['o / Enter', 'Open article'],
                ['s', 'Star / unstar'],
                ['m', 'Toggle read'],
                ['/', 'Focus search'],
                ['Esc', 'Close article'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center gap-2">
                  <kbd className="px-1.5 py-0.5 bg-surface-tertiary border border-border rounded text-[10px] font-mono text-text-secondary">{key}</kbd>
                  <span className="text-text-secondary">{desc}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function AIUsageSection() {
  const { data: usage } = useQuery({ queryKey: ['ai-usage'], queryFn: aiApi.getUsage });

  if (!usage) {
    return (
      <section>
        <h3 className="text-sm font-medium text-text-primary mb-3">AI Usage</h3>
        <p className="text-xs text-text-tertiary">Loading...</p>
      </section>
    );
  }

  const fmtCost = (n: number) => `$${n.toFixed(4)}`;
  const fmtTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return (
    <section>
      <h3 className="text-sm font-medium text-text-primary mb-3">AI Usage</h3>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-surface-secondary border border-border rounded-lg p-3">
          <p className="text-xs text-text-tertiary uppercase tracking-wider">Today</p>
          <p className="text-lg font-bold text-text-primary mt-1">{fmtCost(usage.today.costUsd)}</p>
          <p className="text-xs text-text-secondary">{usage.today.calls} calls</p>
        </div>
        <div className="bg-surface-secondary border border-border rounded-lg p-3">
          <p className="text-xs text-text-tertiary uppercase tracking-wider">This Month</p>
          <p className="text-lg font-bold text-text-primary mt-1">{fmtCost(usage.thisMonth.costUsd)}</p>
          <p className="text-xs text-text-secondary">
            {usage.thisMonth.calls} calls · {fmtTokens(usage.thisMonth.inputTokens)}/{fmtTokens(usage.thisMonth.outputTokens)} tok
          </p>
        </div>
      </div>

      {usage.byOperation.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">By Operation (this month)</p>
          <div className="space-y-1">
            {usage.byOperation.map((op) => (
              <div key={op.operation} className="flex items-center justify-between text-xs">
                <span className="text-text-primary capitalize">{op.operation.replace('_', ' ')}</span>
                <span className="text-text-secondary">{op.count} · {fmtCost(op.costUsd)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {usage.recent.length > 0 && (
        <div>
          <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Recent</p>
          <div className="space-y-0.5 max-h-40 overflow-y-auto">
            {usage.recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs py-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-text-primary capitalize truncate">{r.operation.replace('_', ' ')}</span>
                  <span className="text-text-tertiary text-[10px]">{new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <span className="text-text-secondary tabular-nums">{fmtCost(r.costUsd)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {usage.thisMonth.calls === 0 && (
        <p className="text-xs text-text-tertiary text-center py-3">No AI usage yet this month</p>
      )}
    </section>
  );
}
