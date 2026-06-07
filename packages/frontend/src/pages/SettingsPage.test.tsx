import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage.js';

const mocks = vi.hoisted(() => ({
  importOpmlMock: vi.fn(),
  exportOpmlMock: vi.fn(),
  getConfigMock: vi.fn(),
  getUsageMock: vi.fn(),
  updateConfigMock: vi.fn(),
  getProfileMock: vi.fn(),
  updateProfileMock: vi.fn(),
  capabilitiesMock: vi.fn(),
  pushTestMock: vi.fn(),
  subscribeToPushMock: vi.fn(),
  unsubscribeFromPushMock: vi.fn(),
  isCurrentlySubscribedMock: vi.fn(),
  isPushSupportedMock: vi.fn(),
  getPushPermissionMock: vi.fn(),
}));

vi.mock('../api/index.js', () => ({
  opmlApi: {
    importOpml: mocks.importOpmlMock,
    exportOpml: mocks.exportOpmlMock,
  },
  aiApi: {
    getConfig: mocks.getConfigMock,
    getUsage: mocks.getUsageMock,
    updateConfig: mocks.updateConfigMock,
  },
}));

vi.mock('../api/user.api.js', () => ({
  userApi: {
    getProfile: mocks.getProfileMock,
    updateProfile: mocks.updateProfileMock,
  },
}));

vi.mock('../api/push.api.js', () => ({
  deliveryApi: {
    capabilities: mocks.capabilitiesMock,
  },
  pushApi: {
    test: mocks.pushTestMock,
  },
}));

vi.mock('../lib/push-helper.js', () => ({
  subscribeToPush: mocks.subscribeToPushMock,
  unsubscribeFromPush: mocks.unsubscribeFromPushMock,
  isCurrentlySubscribed: mocks.isCurrentlySubscribedMock,
  isPushSupported: mocks.isPushSupportedMock,
  getPushPermission: mocks.getPushPermissionMock,
}));

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function Wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={createClient()}>{children}</QueryClientProvider>;
}

function triggerReactInputValue(element: HTMLElement, value: string) {
  const reactPropsKey = Object.keys(element).find((key) => key.startsWith('__reactProps$'));

  if (!reactPropsKey) {
    throw new Error('React props not found on element');
  }

  const onChange = (element as unknown as Record<string, { onChange?: (event: { target: { value: string } }) => void }>)[reactPropsKey]?.onChange;

  if (!onChange) {
    throw new Error('React onChange handler not found');
  }

  act(() => {
    onChange({ target: { value } });
  });
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    if (!('supportedValuesOf' in Intl)) {
      Object.defineProperty(Intl, 'supportedValuesOf', {
        configurable: true,
        value: () => ['Europe/London', 'America/New_York'],
      });
    } else {
      vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Europe/London', 'America/New_York']);
    }

    mocks.getConfigMock.mockResolvedValue({ provider: 'openai', hasKey: true });
    mocks.getUsageMock.mockResolvedValue({
      today: { calls: 2, costUsd: 0.1234 },
      thisMonth: { calls: 0, inputTokens: 1500, outputTokens: 500, costUsd: 1.2345 },
      byOperation: [{ operation: 'summarize', count: 2, costUsd: 0.42 }],
      recent: [{ id: 'usage-1', operation: 'summarize', model: 'gpt', inputTokens: 10, outputTokens: 20, costUsd: 0.05, createdAt: '2026-06-05T10:00:00.000Z' }],
    });
    mocks.getProfileMock.mockResolvedValue({
      id: 'user-1',
      email: 'reader@example.com',
      displayName: 'Reader',
      timezone: 'Europe/London',
      digestSchedule: '07:00',
      digestEnabled: true,
      digestEmail: true,
      digestPush: false,
    });
    mocks.updateProfileMock.mockResolvedValue(undefined);
    mocks.capabilitiesMock.mockResolvedValue({ email: true, push: true });
    mocks.pushTestMock.mockResolvedValue({ sent: 1 });
    mocks.subscribeToPushMock.mockResolvedValue({ ok: true });
    mocks.unsubscribeFromPushMock.mockResolvedValue(undefined);
    mocks.isCurrentlySubscribedMock.mockResolvedValue(false);
    mocks.isPushSupportedMock.mockResolvedValue(true);
    mocks.getPushPermissionMock.mockResolvedValue('default');
    mocks.importOpmlMock.mockResolvedValue({ imported: 2, failed: 1, errors: ['bad feed'] });
    mocks.exportOpmlMock.mockResolvedValue('<opml />');
    mocks.updateConfigMock.mockResolvedValue(undefined);

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:lede'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('loads config and profile data, saves AI config, and removes AI settings', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(<SettingsPage onClose={onClose} />, { wrapper: Wrapper });

    await screen.findByText('AI configured: openai');
    expect(screen.getByText('No AI usage yet this month')).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('/mcp'))).toBeInTheDocument();

    const selects = container.querySelectorAll('select');
    await user.selectOptions(selects[1] as HTMLSelectElement, 'anthropic');
    await user.type(screen.getByPlaceholderText('••••••••'), 'sk-test');
    await user.click(screen.getAllByRole('button', { name: 'Save' })[2]);

    await waitFor(() => {
      expect(mocks.updateConfigMock).toHaveBeenCalledWith('anthropic', 'sk-test');
    });
    expect(await screen.findByText('AI configuration saved')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove AI' }));
    await waitFor(() => {
      expect(mocks.updateConfigMock).toHaveBeenCalledWith(null, null);
    });
    expect(await screen.findByText('AI configuration removed')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button')[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('updates digest settings, imports OPML, exports OPML, and shows export failures', async () => {
    const user = userEvent.setup();
    const { container } = render(<SettingsPage onClose={() => {}} />, { wrapper: Wrapper });

    const timeInput = container.querySelector('input[type="time"]') as HTMLInputElement;
    await waitFor(() => expect(timeInput).toHaveValue('07:00'));

    triggerReactInputValue(timeInput, '08:30');
    await user.selectOptions(container.querySelectorAll('select')[0] as HTMLSelectElement, 'America/New_York');

    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    await user.click(screen.getAllByRole('button', { name: 'Save' })[1]);
    await waitFor(() => {
      expect(mocks.updateProfileMock).toHaveBeenCalledWith({ digestSchedule: expect.any(String) });
      expect(mocks.updateProfileMock).toHaveBeenCalledWith({ timezone: 'America/New_York' });
    });

    mocks.importOpmlMock.mockResolvedValueOnce({ imported: 1, failed: 0, errors: [] });
    const file = new File(['<opml />'], 'feeds.opml', { type: 'text/xml' });
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: vi.fn().mockResolvedValue('<opml />'),
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(mocks.importOpmlMock).toHaveBeenCalledWith('<opml />'));
    expect(await screen.findByText((content) => content.trim() === 'Imported 1 feeds.')).toBeInTheDocument();

    mocks.importOpmlMock.mockResolvedValueOnce({ imported: 2, failed: 1, errors: ['bad feed'] });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText('Imported 2 feeds. 1 failed.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Export OPML' }));
    await waitFor(() => expect(mocks.exportOpmlMock).toHaveBeenCalledTimes(1));
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:lede');

    mocks.exportOpmlMock.mockRejectedValueOnce(new Error('boom'));
    await user.click(screen.getByRole('button', { name: 'Export OPML' }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Export failed'));
  });

  it('handles delivery, push, and install prompt flows', async () => {
    const user = userEvent.setup();
    const installPrompt = Object.assign(new Event('beforeinstallprompt'), {
      prompt: vi.fn().mockResolvedValue(undefined),
      preventDefault: vi.fn(),
    });

    mocks.isCurrentlySubscribedMock.mockResolvedValue(true);
    mocks.getPushPermissionMock.mockResolvedValue('granted');
    mocks.pushTestMock.mockRejectedValueOnce(new Error('nope'));

    render(<SettingsPage onClose={() => {}} />, { wrapper: Wrapper });

    await screen.findByText('Enabled on this device');

    await user.click(screen.getByRole('button', { name: 'Send test notification' }));
    expect(await screen.findByText('Test push failed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Disable' }));
    await waitFor(() => {
      expect(mocks.unsubscribeFromPushMock).toHaveBeenCalledTimes(1);
      expect(mocks.updateProfileMock).toHaveBeenCalledWith({ digestPush: false });
    });

    fireEvent(window, installPrompt);
    expect(await screen.findByText('Install lede')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() => expect(installPrompt.prompt).toHaveBeenCalledTimes(1));
  });

  it('keeps push disabled when the browser does not support it', async () => {
    mocks.isPushSupportedMock.mockResolvedValue(false);
    mocks.getConfigMock.mockResolvedValue({ provider: null, hasKey: false });

    render(<SettingsPage onClose={() => {}} />, { wrapper: Wrapper });

    expect(await screen.findByText('Not supported in this browser')).toBeInTheDocument();
    expect(screen.queryByText('AI Usage')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enable' })).toBeDisabled();
  });

  it('shows subscription errors when push subscription fails', async () => {
    const user = userEvent.setup();
    mocks.getConfigMock.mockResolvedValue({ provider: null, hasKey: false });
    mocks.isPushSupportedMock.mockResolvedValue(true);
    mocks.subscribeToPushMock.mockResolvedValue({ ok: false, error: 'Permission refused' });

    render(<SettingsPage onClose={() => {}} />, { wrapper: Wrapper });
    await screen.findByText('Enable to get a notification when your digest is ready');

    await user.click(screen.getByRole('button', { name: 'Enable' }));
    expect(await screen.findByText('Permission refused')).toBeInTheDocument();
  });

  it('enables push successfully and shows the server email-disabled copy', async () => {
    const user = userEvent.setup();
    mocks.getConfigMock.mockResolvedValue({ provider: null, hasKey: false });
    mocks.capabilitiesMock.mockResolvedValue({ email: false, push: true });
    mocks.isPushSupportedMock.mockResolvedValue(true);
    mocks.isCurrentlySubscribedMock.mockResolvedValue(false);
    mocks.subscribeToPushMock.mockResolvedValue({ ok: true });

    render(<SettingsPage onClose={() => {}} />, { wrapper: Wrapper });

    expect(await screen.findByText('Email delivery is not configured on this server')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enable' }));
    await waitFor(() => {
      expect(mocks.subscribeToPushMock).toHaveBeenCalledTimes(1);
      expect(mocks.updateProfileMock).toHaveBeenCalledWith({ digestPush: true });
    });
    expect(await screen.findByText('Enabled on this device')).toBeInTheDocument();
  });

  it('shows import and AI save fallback errors and toggles the digest enabled state', async () => {
    const user = userEvent.setup();
    mocks.importOpmlMock.mockRejectedValueOnce('nope');
    mocks.updateConfigMock.mockRejectedValueOnce('bad config');

    const { container } = render(<SettingsPage onClose={() => {}} />, { wrapper: Wrapper });
    await screen.findByText('Morning Digest');

    const toggleButtons = container.querySelectorAll('button.w-9.h-5');
    await user.click(toggleButtons[0] as HTMLButtonElement);
    await waitFor(() => {
      expect(mocks.updateProfileMock).toHaveBeenCalledWith({ digestEnabled: false });
    });

    const file = new File(['<opml />'], 'feeds.opml', { type: 'text/xml' });
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: vi.fn().mockResolvedValue('<opml />'),
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText('Import failed: Unknown error')).toBeInTheDocument();

    const selects = container.querySelectorAll('select');
    await user.selectOptions(selects[1] as HTMLSelectElement, 'anthropic');
    await user.type(screen.getByPlaceholderText('••••••••'), 'sk-fail');
    await user.click(screen.getAllByRole('button', { name: 'Save' })[2]);
    expect(await screen.findByText('Failed: Unknown error')).toBeInTheDocument();
  });

  it('returns early when no OPML file is chosen and surfaces Error-based import failures', async () => {
    const { container } = render(<SettingsPage onClose={() => {}} />, { wrapper: Wrapper });
    await screen.findByText('OPML Import / Export');

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(mocks.importOpmlMock).not.toHaveBeenCalled();

    mocks.importOpmlMock.mockRejectedValueOnce(new Error('Malformed OPML'));
    const file = new File(['<opml />'], 'broken.opml', { type: 'text/xml' });
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: vi.fn().mockResolvedValue('<opml />'),
    });

    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText('Import failed: Malformed OPML')).toBeInTheDocument();
  });

  it('saves cleared AI settings when an existing key is already configured', async () => {
    const user = userEvent.setup();

    render(<SettingsPage onClose={() => {}} />, { wrapper: Wrapper });
    await screen.findByText('AI configured: openai');

    await user.selectOptions(screen.getAllByRole('combobox')[1] as HTMLSelectElement, '');
    mocks.updateConfigMock.mockResolvedValueOnce(undefined);
    await user.click(screen.getAllByRole('button', { name: 'Save' })[2]);
    await waitFor(() => {
      expect(mocks.updateConfigMock).toHaveBeenCalledWith(null, null);
    });
    expect(await screen.findByText('AI configuration saved')).toBeInTheDocument();
  });

  it('shows the no-key placeholder and surfaces Error-based AI save failures', async () => {
    const user = userEvent.setup();
    mocks.getConfigMock.mockResolvedValue({ provider: null, hasKey: false });

    const { container } = render(<SettingsPage onClose={() => {}} />, { wrapper: Wrapper });
    await screen.findByText('AI Configuration (BYOAI)');

    await user.selectOptions(container.querySelectorAll('select')[1] as HTMLSelectElement, 'openai');
    expect(screen.getByPlaceholderText('Enter your API key')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Enter your API key'), 'sk-bad');
    mocks.updateConfigMock.mockRejectedValueOnce(new Error('Bad key'));
    await user.click(screen.getAllByRole('button', { name: 'Save' })[2]);
    expect(await screen.findByText('Failed: Bad key')).toBeInTheDocument();
  });

  it('shows the AI usage loading state while usage is still resolving', async () => {
    mocks.getUsageMock.mockImplementationOnce(() => new Promise(() => {}));

    render(<SettingsPage onClose={() => {}} />, { wrapper: Wrapper });

    expect(await screen.findByText('AI Usage')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows delivery capability-loading copy', async () => {
    mocks.getConfigMock.mockResolvedValue({ provider: null, hasKey: false });
    mocks.capabilitiesMock.mockImplementationOnce(() => new Promise(() => {}));
    mocks.isPushSupportedMock.mockResolvedValue(true);

    render(<SettingsPage onClose={() => {}} />, { wrapper: Wrapper });

    expect(await screen.findByText('Checking server capabilities...')).toBeInTheDocument();
  });

  it('shows the push-not-configured state', async () => {
    mocks.getConfigMock.mockResolvedValue({ provider: null, hasKey: false });
    mocks.capabilitiesMock.mockResolvedValue({ email: true, push: false });
    mocks.isPushSupportedMock.mockResolvedValue(true);

    render(<SettingsPage onClose={() => {}} />, { wrapper: Wrapper });

    expect(await screen.findByText('Push delivery is not configured on this server')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enable' })).toBeDisabled();
  });

  it('shows the permission-denied push state and disables enabling push', async () => {
    mocks.getConfigMock.mockResolvedValue({ provider: null, hasKey: false });
    mocks.capabilitiesMock.mockResolvedValue({ email: true, push: true });
    mocks.isPushSupportedMock.mockResolvedValue(true);
    mocks.getPushPermissionMock.mockResolvedValue('denied');
    mocks.isCurrentlySubscribedMock.mockResolvedValue(false);

    render(<SettingsPage onClose={() => {}} />, { wrapper: Wrapper });

    expect(await screen.findByText('Permission denied — enable in browser settings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enable' })).toBeDisabled();
  });

  it('toggles email delivery when server email support is enabled', async () => {
    const user = userEvent.setup();
    const { container } = render(<SettingsPage onClose={() => {}} />, { wrapper: Wrapper });

    await screen.findByText('Sent to reader@example.com each morning');

    const toggleButtons = container.querySelectorAll('button.w-9.h-5');
    await user.click(toggleButtons[1] as HTMLButtonElement);

    await waitFor(() => {
      expect(mocks.updateProfileMock).toHaveBeenCalledWith({ digestEmail: false });
    });
  });

  it('falls back to the generic push subscription error when no message is returned', async () => {
    const user = userEvent.setup();
    mocks.getConfigMock.mockResolvedValue({ provider: null, hasKey: false });
    mocks.isPushSupportedMock.mockResolvedValue(true);
    mocks.capabilitiesMock.mockResolvedValue({ email: true, push: true });
    mocks.getPushPermissionMock.mockResolvedValue('default');
    mocks.isCurrentlySubscribedMock.mockResolvedValue(false);
    mocks.subscribeToPushMock.mockResolvedValue({ ok: false });

    render(<SettingsPage onClose={() => {}} />, { wrapper: Wrapper });
    await screen.findByText('Enable to get a notification when your digest is ready');

    await user.click(screen.getByRole('button', { name: 'Enable' }));
    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
  });

  it('shows the push capability-loading copy and allows a successful test push without an error', async () => {
    const user = userEvent.setup();
    const capabilitiesPromise = new Promise(() => {});

    mocks.capabilitiesMock.mockImplementationOnce(() => capabilitiesPromise);
    mocks.isPushSupportedMock.mockResolvedValue(true);
    mocks.isCurrentlySubscribedMock.mockResolvedValue(true);
    mocks.getPushPermissionMock.mockResolvedValue('granted');
    mocks.pushTestMock.mockResolvedValue({ sent: 1 });

    const { rerender } = render(<SettingsPage onClose={() => {}} />, { wrapper: Wrapper });

    const pushSection = (await screen.findByText('Push notifications')).closest('div.mb-4') as HTMLElement;
    expect(within(pushSection).getByText('Checking server capabilities...')).toBeInTheDocument();

    mocks.capabilitiesMock.mockResolvedValue({ email: true, push: true });
    rerender(<SettingsPage onClose={() => {}} />);

    await user.click(await screen.findByRole('button', { name: 'Send test notification' }));
    expect(mocks.pushTestMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Test push failed')).not.toBeInTheDocument();
  });
});
