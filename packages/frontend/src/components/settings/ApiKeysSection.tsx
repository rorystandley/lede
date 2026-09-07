import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateApiKeyInput } from '@lede/shared';
import { apiKeysApi, type ApiKeySummary, type CreatedApiKey } from '../../api/api-keys.api.js';
import { useAuthStore } from '../../stores/auth.store.js';

const inputClass = 'w-full rounded border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-500';
const buttonClass = 'rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';
const formatDate = (date: string) => new Date(date).toLocaleString();

export function ApiKeysSection() {
  const qc = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  const queryKey = ['api-keys', userId];
  const keys = useQuery({ queryKey, queryFn: apiKeysApi.list });
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [revoking, setRevoking] = useState<ApiKeySummary | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLHeadingElement>(null);
  const revokeTrigger = useRef<HTMLButtonElement | null>(null);

  const create = useMutation({
    // Return no data: the raw key must never enter React Query's mutation cache.
    mutationFn: async (input: CreateApiKeyInput) => {
      const result = await apiKeysApi.create(input);
      setCreated(result);
      setName('');
      setExpiry('');
    },
    retry: false,
    gcTime: 0,
    onSuccess: () => { void qc.invalidateQueries({ queryKey }); },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(id),
    retry: false,
    onSuccess: async (_, id) => {
      await qc.cancelQueries({ queryKey });
      qc.setQueryData<ApiKeySummary[]>(queryKey, (current) => current?.filter((key) => key.id !== id));
      setStatus(`“${revoking?.name}” revoked.`);
      setRevoking(null);
      listRef.current?.focus();
      void qc.invalidateQueries({ queryKey });
    },
  });

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    if (create.isPending || created || revoking) return;
    setValidationError(null);
    setStatus(null);
    create.reset();
    if (!name.trim() || name.trim().length > 100) {
      setValidationError('Enter a key name between 1 and 100 characters.');
      nameRef.current?.focus();
      return;
    }
    const expiresAt = expiry ? new Date(expiry) : null;
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) {
      setValidationError('Choose an expiry date and time in the future.');
      return;
    }
    create.mutate({ name: name.trim(), ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}) });
  };

  const cancelRevoke = () => {
    if (revoke.isPending) return;
    setRevoking(null);
    revoke.reset();
    requestAnimationFrame(() => revokeTrigger.current?.focus());
  };

  return (
    <div className="p-4 space-y-5">
      <div>
        <h3 className="text-sm font-medium text-text-primary">API keys</h3>
        <p className="mt-1 text-xs leading-5 text-text-secondary">
          Give scripts and AI agents access to your Lede account. Keep keys private: anyone with a key can access your account through the API.
        </p>
        <p className="mt-2 text-xs text-text-secondary">
          Use a key as a Bearer token. MCP endpoint: <code className="break-all">{window.location.origin}/mcp</code>
        </p>
      </div>

      {created ? (
        <CreatedKey key={created.id} created={created} onDismiss={() => {
          setCreated(null);
          create.reset();
          setStatus('Key hidden. It cannot be shown again.');
          // The form mounts after the reveal is dismissed.
          requestAnimationFrame(() => nameRef.current?.focus());
        }} />
      ) : (
        <form onSubmit={handleCreate} className="rounded-lg border border-border p-4 space-y-3">
          <h4 className="text-sm font-medium text-text-primary">Create an API key</h4>
          <fieldset disabled={create.isPending || !!revoking} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">Key name</span>
              <input ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} placeholder="e.g. Desktop agent" autoComplete="off" className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">Expires at (optional)</span>
              <input type="datetime-local" value={expiry} onChange={(event) => setExpiry(event.target.value)} aria-describedby="api-key-expiry-help" className={inputClass} />
            </label>
            <p id="api-key-expiry-help" className="text-xs text-text-tertiary">Your local date and time. Leave blank for no expiry.</p>
            <button type="submit" className={`${buttonClass} bg-primary-600 text-white hover:bg-primary-700`}>
              {create.isPending ? 'Creating…' : 'Create key'}
            </button>
          </fieldset>
          {(validationError || create.isError) && <p role="alert" className="text-xs text-red-500">{validationError || `Could not create key: ${errorMessage(create.error)}`}</p>}
        </form>
      )}

      {status && <p role="status" className="text-xs text-text-secondary">{status}</p>}

      <section aria-labelledby="api-key-list-title" className="space-y-3">
        <h4 id="api-key-list-title" ref={listRef} tabIndex={-1} className="text-sm font-medium text-text-primary">Your keys</h4>
        {keys.isPending && <p role="status" className="text-xs text-text-tertiary">Loading API keys…</p>}
        {keys.isError && (
          <div role="alert" className="space-y-2 text-xs text-red-500">
            <p>Could not load API keys: {errorMessage(keys.error)}</p>
            <button onClick={() => void keys.refetch()} disabled={keys.isFetching} className={`${buttonClass} border border-border text-text-secondary hover:bg-surface-tertiary`}>Retry</button>
          </div>
        )}
        {!keys.isPending && !keys.isError && keys.data?.length === 0 && <p className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-text-secondary">No API keys yet.</p>}
        <ul className="space-y-3">
          {keys.data?.map((key) => (
            <li key={key.id} className="rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h5 className="break-words text-sm font-medium text-text-primary">{key.name}</h5>
                  <p className="mt-1 font-mono text-xs text-text-secondary">{key.keyPrefix}…</p>
                </div>
                <button
                  aria-label={`Revoke ${key.name}`}
                  disabled={!!revoking || create.isPending || !!created}
                  onClick={(event) => {
                    revokeTrigger.current = event.currentTarget;
                    revoke.reset();
                    setStatus(null);
                    setRevoking(key);
                  }}
                  className={`${buttonClass} shrink-0 border border-red-300 text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20`}
                >Revoke</button>
              </div>
              <dl className="mt-3 space-y-1 text-xs text-text-secondary">
                <div><dt className="inline">Created: </dt><dd className="inline">{formatDate(key.createdAt)}</dd></div>
                <div><dt className="inline">Last used: </dt><dd className="inline">{key.lastUsed ? formatDate(key.lastUsed) : 'Never'}</dd></div>
                <div><dt className="inline">Expiry: </dt><dd className="inline">{key.expiresAt ? `${new Date(key.expiresAt).getTime() <= Date.now() ? 'Expired' : 'Expires'} ${formatDate(key.expiresAt)}` : 'No expiry'}</dd></div>
              </dl>
              {revoking?.id === key.id && (
                <div role="group" aria-labelledby="revoke-key-title" aria-describedby="revoke-key-description" className="mt-4 border-t border-border pt-3 space-y-3" onKeyDown={(event) => {
                  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelRevoke(); }
                }}>
                  <h5 id="revoke-key-title" className="text-sm font-medium text-text-primary">Revoke “{key.name}”?</h5>
                  <p id="revoke-key-description" className="text-xs text-text-secondary">This cannot be undone. Scripts and agents using this key will immediately lose access.</p>
                  {revoke.isError && <p role="alert" className="text-xs text-red-500">Could not revoke key: {errorMessage(revoke.error)}</p>}
                  <div className="flex flex-wrap gap-2">
                    <button autoFocus disabled={revoke.isPending} onClick={cancelRevoke} className={`${buttonClass} border border-border text-text-secondary hover:bg-surface-tertiary`}>Cancel</button>
                    <button disabled={revoke.isPending} onClick={() => { if (!revoke.isPending) revoke.mutate(key.id); }} className={`${buttonClass} bg-red-600 text-white hover:bg-red-700`}>{revoke.isPending ? 'Revoking…' : 'Revoke key'}</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function CreatedKey({ created, onDismiss }: { created: CreatedApiKey; onDismiss: () => void }) {
  const [copyStatus, setCopyStatus] = useState<'copied' | 'failed' | null>(null);
  const [copying, setCopying] = useState(false);
  const keyRef = useRef<HTMLTextAreaElement>(null);

  const copy = async () => {
    setCopying(true);
    setCopyStatus(null);
    try {
      await navigator.clipboard.writeText(created.key);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
      keyRef.current?.focus();
      keyRef.current?.select();
    } finally {
      setCopying(false);
    }
  };

  return (
    <section aria-labelledby="created-key-title" className="rounded-lg border border-primary-500 bg-surface-secondary p-4 space-y-3">
      <h4 id="created-key-title" className="text-sm font-medium text-text-primary">Save your new key: {created.name}</h4>
      <p id="created-key-warning" className="text-xs text-text-secondary">This key is shown only once. Copy it now and store it securely. After you dismiss this message, switch tabs, or close Settings, you cannot retrieve it again.</p>
      <label className="block">
        <span className="mb-1 block text-xs text-text-secondary">New API key</span>
        <textarea ref={keyRef} autoFocus readOnly value={created.key} rows={3} spellCheck={false} autoComplete="off" aria-describedby="created-key-warning" onFocus={(event) => event.target.select()} className={`${inputClass} font-mono break-all`} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button disabled={copying} onClick={() => void copy()} className={`${buttonClass} bg-primary-600 text-white hover:bg-primary-700`}>{copying ? 'Copying…' : 'Copy key'}</button>
        <button onClick={onDismiss} className={`${buttonClass} border border-border text-text-secondary hover:bg-surface-tertiary`}>I’ve saved my key</button>
      </div>
      {copyStatus === 'copied' && <p role="status" className="text-xs text-text-secondary">Key copied.</p>}
      {copyStatus === 'failed' && <p role="alert" className="text-xs text-red-500">Could not copy automatically. Select the key and copy it manually.</p>}
    </section>
  );
}
