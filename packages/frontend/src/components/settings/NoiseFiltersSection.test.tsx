import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoiseFiltersSection } from './NoiseFiltersSection.js';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  run: vi.fn(),
  delete: vi.fn(),
  useFeeds: vi.fn(),
  useFolders: vi.fn(),
}));

vi.mock('../../api/rules.api.js', () => ({
  rulesApi: {
    list: mocks.list,
    create: mocks.create,
    update: mocks.update,
    run: mocks.run,
    delete: mocks.delete,
  },
}));

vi.mock('../../hooks/use-feeds.js', () => ({ useFeeds: () => mocks.useFeeds() }));
vi.mock('../../hooks/use-folders.js', () => ({ useFolders: () => mocks.useFolders() }));

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><NoiseFiltersSection /></QueryClientProvider>);
}

const existingFilter = {
  id: 'rule-1',
  userId: 'user-1',
  name: 'Hide sponsored posts',
  enabled: true,
  priority: 0,
  conditions: [{ field: 'title', op: 'contains', value: 'sponsored' }],
  actions: [{ type: 'hide' }],
  matchMode: 'all',
  runCount: 4,
  lastRunAt: null,
  createdAt: '2026-07-10T09:00:00.000Z',
  updatedAt: '2026-07-10T09:00:00.000Z',
};

describe('NoiseFiltersSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([]);
    mocks.create.mockResolvedValue({ ...existingFilter, id: 'rule-new' });
    mocks.update.mockImplementation(async (_id, update) => ({ ...existingFilter, ...update }));
    mocks.run.mockResolvedValue({ matched: 7 });
    mocks.delete.mockResolvedValue(undefined);
    mocks.useFeeds.mockReturnValue({ data: { items: [{ id: 'feed-1', title: 'Tech', customTitle: null }] } });
    mocks.useFolders.mockReturnValue({ data: [] });
  });

  it('creates a persistent hide filter and applies it to existing articles', async () => {
    renderSection();

    expect(await screen.findByText('No noise filters yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add noise filter' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Hide sponsored posts'), { target: { value: 'Hide sponsored posts' } });
    fireEvent.change(screen.getByLabelText('Value 1'), { target: { value: 'sponsored' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and apply' }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      name: 'Hide sponsored posts',
      conditions: [{ field: 'title', op: 'contains', value: 'sponsored' }],
      actions: [{ type: 'hide' }],
      matchMode: 'all',
    }));
    expect(mocks.run).toHaveBeenCalledWith('rule-new');
    expect(await screen.findByRole('status')).toHaveTextContent('7 current articles hidden');
  });

  it('turns a filter off reversibly and deletes it with confirmation', async () => {
    mocks.list.mockResolvedValue([existingFilter]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderSection();

    const toggle = await screen.findByRole('switch', { name: 'Turn off Hide sponsored posts' });
    fireEvent.click(toggle);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('rule-1', { enabled: false }));
    expect(mocks.run).not.toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent('visible again');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('rule-1'));
  });
});
