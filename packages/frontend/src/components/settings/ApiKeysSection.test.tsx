import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiKeysSection } from './ApiKeysSection.js';
import type { ApiKeySummary } from '../../api/api-keys.api.js';

const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), revoke: vi.fn() }));
vi.mock('../../api/api-keys.api.js', () => ({ apiKeysApi: mocks }));

const existing: ApiKeySummary = {
  id: 'key-1', name: 'Desktop agent', keyPrefix: 'nrk_abcd',
  createdAt: '2026-01-01T12:00:00.000Z', lastUsed: null, expiresAt: null,
};
const secret = 'nrk_test_secret_shown_only_at_creation';
const created = { ...existing, id: 'key-new', name: 'New agent', key: secret };

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><ApiKeysSection /></QueryClientProvider>);
  return { ...view, client };
}

async function submitKey(name = 'New agent') {
  fireEvent.change(screen.getByLabelText('Key name'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
}

beforeEach(() => {
  mocks.list.mockResolvedValue([]);
  mocks.create.mockResolvedValue(created);
  mocks.revoke.mockResolvedValue(undefined);
});

describe('ApiKeysSection', () => {
  it('shows loading, metadata, unused keys and expired keys without exposing secrets', async () => {
    let resolve!: (keys: ApiKeySummary[]) => void;
    mocks.list.mockReturnValue(new Promise((done) => { resolve = done; }));
    renderSection();
    expect(screen.getByRole('status')).toHaveTextContent('Loading API keys');
    await act(async () => resolve([existing, { ...existing, id: 'expired', name: 'Old script', lastUsed: '2020-01-02T00:00:00Z', expiresAt: '2020-02-01T00:00:00Z' }]));
    expect(await screen.findByText('Desktop agent')).toBeInTheDocument();
    expect(screen.getAllByText('nrk_abcd…')).toHaveLength(2);
    expect(screen.getByText('Never')).toBeInTheDocument();
    expect(screen.getByText('No expiry')).toBeInTheDocument();
    expect(screen.getByText(/^Expired /)).toBeInTheDocument();
    expect(screen.queryByLabelText('New API key')).not.toBeInTheDocument();
  });

  it('retries a failed list request without showing an empty success state', async () => {
    mocks.list.mockRejectedValueOnce(new Error('Offline'));
    renderSection();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load API keys: Offline');
    expect(screen.queryByText('No API keys yet.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No API keys yet.')).toBeInTheDocument();
  });

  it('creates a trimmed name without expiry, copies the key, and permanently dismisses it without caching it', async () => {
    const user = userEvent.setup();
    const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const { client, unmount } = renderSection();
    await screen.findByText('No API keys yet.');
    mocks.list.mockResolvedValue([{ ...existing, id: created.id, name: created.name }]);
    await submitKey('  New agent  ');
    expect(await screen.findByLabelText('New API key')).toHaveValue(secret);
    expect(mocks.create).toHaveBeenCalledWith({ name: 'New agent' });
    expect(screen.getByLabelText('New API key')).toHaveFocus();
    expect(screen.getByText(/This key is shown only once/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy key' }));
    expect(clipboard).toHaveBeenCalledWith(secret);
    expect(await screen.findByText('Key copied.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'I’ve saved my key' }));
    expect(screen.queryByDisplayValue(secret)).not.toBeInTheDocument();
    expect(JSON.stringify(client.getQueryCache().getAll().map((query) => query.state))).not.toContain(secret);
    expect(JSON.stringify(client.getMutationCache().getAll().map((mutation) => mutation.state))).not.toContain(secret);
    expect(localStorage.getItem('lede-auth') ?? '').not.toContain(secret);
    unmount();
    render(<QueryClientProvider client={client}><ApiKeysSection /></QueryClientProvider>);
    expect(screen.queryByLabelText('New API key')).not.toBeInTheDocument();
  });

  it('preserves a newly created secret if refreshing the key list fails', async () => {
    renderSection();
    await screen.findByText('No API keys yet.');
    mocks.list.mockRejectedValue(new Error('Refresh failed'));
    await submitKey();
    expect(await screen.findByLabelText('New API key')).toHaveValue(secret);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load API keys: Refresh failed');
    expect(screen.getByLabelText('New API key')).toHaveValue(secret);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('forgets a secret on unmount without requiring explicit dismissal', async () => {
    const { client, unmount } = renderSection();
    await submitKey();
    expect(await screen.findByLabelText('New API key')).toHaveValue(secret);
    unmount();
    render(<QueryClientProvider client={client}><ApiKeysSection /></QueryClientProvider>);
    expect(screen.queryByLabelText('New API key')).not.toBeInTheDocument();
    expect(JSON.stringify(client.getMutationCache().getAll().map((mutation) => mutation.state))).not.toContain(secret);
  });

  it('converts optional local expiry to UTC and blocks duplicate submissions while creating', async () => {
    let resolve!: (value: typeof created) => void;
    mocks.create.mockReturnValue(new Promise((done) => { resolve = done; }));
    renderSection();
    fireEvent.change(screen.getByLabelText('Expires at (optional)'), { target: { value: '2099-06-01T15:30' } });
    await submitKey();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ name: 'New agent', expiresAt: new Date('2099-06-01T15:30').toISOString() }));
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(screen.getByLabelText('Key name')).toBeDisabled();
    fireEvent.submit(screen.getByLabelText('Key name').closest('form')!);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await act(async () => resolve(created));
    expect(await screen.findByLabelText('New API key')).toHaveValue(secret);
  });

  it('validates whitespace names and past expiry without creating a key', async () => {
    renderSection();
    await submitKey('   ');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a key name');
    fireEvent.change(screen.getByLabelText('Expires at (optional)'), { target: { value: '2020-01-01T12:00' } });
    await submitKey();
    expect(screen.getByRole('alert')).toHaveTextContent('in the future');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('retains form input on create failure and allows retry', async () => {
    mocks.create.mockRejectedValueOnce(new Error('Service unavailable'));
    renderSection();
    await submitKey();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create key: Service unavailable');
    expect(screen.getByLabelText('Key name')).toHaveValue('New agent');
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    expect(await screen.findByLabelText('New API key')).toHaveValue(secret);
  });

  it.each(['denied', 'unavailable'])('keeps the secret selectable when clipboard access is %s', async (mode) => {
    const user = userEvent.setup();
    if (mode === 'denied') vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Denied'));
    else vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(undefined as unknown as Clipboard);
    renderSection();
    await submitKey();
    await user.click(await screen.findByRole('button', { name: 'Copy key' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('copy it manually');
    const field = screen.getByLabelText('New API key') as HTMLTextAreaElement;
    expect(field).toHaveValue(secret);
    expect(field).toHaveFocus();
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(secret.length);
  });

  it('requires explicit revocation, supports cancellation, and updates the list after success', async () => {
    const user = userEvent.setup();
    mocks.list.mockResolvedValue([existing]);
    renderSection();
    const trigger = await screen.findByRole('button', { name: 'Revoke Desktop agent' });
    await user.click(trigger);
    expect(mocks.revoke).not.toHaveBeenCalled();
    const confirmation = screen.getByRole('group', { name: 'Revoke “Desktop agent”?' });
    expect(confirmation).toHaveTextContent('cannot be undone');
    expect(within(confirmation).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Revoke “Desktop agent”?' })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(mocks.revoke).not.toHaveBeenCalled();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.revoke).not.toHaveBeenCalled();
    await user.click(trigger);
    mocks.list.mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: 'Revoke key' }));
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith('key-1'));
    expect(await screen.findByText('“Desktop agent” revoked.')).toBeInTheDocument();
    expect(await screen.findByText('No API keys yet.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your keys' })).toHaveFocus();
  });

  it('keeps a failed revocation open for retry and disables controls during the request', async () => {
    let reject!: (reason: Error) => void;
    mocks.list.mockResolvedValue([existing]);
    mocks.revoke.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Desktop agent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke key' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Revoking…' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('group', { name: 'Revoke “Desktop agent”?' }), { key: 'Escape' });
    expect(screen.getByRole('group', { name: 'Revoke “Desktop agent”?' })).toBeInTheDocument();
    await act(async () => reject(new Error('Offline')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not revoke key: Offline');
    expect(screen.getByText('Desktop agent')).toBeInTheDocument();
    mocks.list.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke key' }));
    expect(await screen.findByText('“Desktop agent” revoked.')).toBeInTheDocument();
  });
});
