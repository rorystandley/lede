import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RulesPage } from './RulesPage.js';

const {
  rulesApi,
  useTagsMock,
  useFeedsMock,
} = vi.hoisted(() => ({
  rulesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  useTagsMock: vi.fn(),
  useFeedsMock: vi.fn(),
}));

vi.mock('../api/index.js', () => ({
  rulesApi,
}));

vi.mock('../hooks/use-tags.js', () => ({
  useTags: () => useTagsMock(),
}));

vi.mock('../hooks/use-feeds.js', () => ({
  useFeeds: () => useFeedsMock(),
}));

function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function renderPage() {
  const client = createTestClient();

  return render(
    <QueryClientProvider client={client}>
      <RulesPage onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('RulesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rulesApi.list.mockResolvedValue([]);
    rulesApi.create.mockResolvedValue({ id: 'rule-new' });
    rulesApi.update.mockResolvedValue({ id: 'rule-updated' });
    rulesApi.delete.mockResolvedValue(undefined);
    useTagsMock.mockReturnValue({
      data: [{ id: 'tag-1', name: 'Important' }],
    });
    useFeedsMock.mockReturnValue({
      data: {
        items: [{ id: 'feed-1', title: 'Example Feed', customTitle: null }],
      },
    });
  });

  it('shows the empty state and lets a new rule editor be canceled', async () => {
    renderPage();

    expect(await screen.findByText('No rules yet. Create one to automate article processing.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New Rule' }));
    expect(screen.getByRole('heading', { name: 'New Rule' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'New Rule' })).not.toBeInTheDocument();
    });
    expect(screen.getByText('No rules yet. Create one to automate article processing.')).toBeInTheDocument();
  });

  it('renders existing rules and handles toggle and delete actions', async () => {
    rulesApi.list.mockResolvedValue([
      {
        id: 'rule-1',
        userId: 'user-1',
        name: 'AI Rule',
        enabled: true,
        priority: 1,
        conditions: [{ field: 'title', op: 'contains', value: 'AI' }],
        actions: [{ type: 'star' }],
        matchMode: 'all',
        runCount: 3,
        lastRunAt: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'rule-2',
        userId: 'user-1',
        name: 'Archive Rule',
        enabled: false,
        priority: 2,
        conditions: [{ field: 'author', op: 'equals', value: 'Newswire' }],
        actions: [{ type: 'mark_archived' }],
        matchMode: 'any',
        runCount: 0,
        lastRunAt: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'rule-3',
        userId: 'user-1',
        name: 'Multi Rule',
        enabled: true,
        priority: 3,
        conditions: [
          { field: 'title', op: 'contains', value: 'AI' },
          { field: 'author', op: 'equals', value: 'Newswire' },
        ],
        actions: [{ type: 'star' }, { type: 'mark_read' }],
        matchMode: 'all',
        runCount: 0,
        lastRunAt: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]);

    const { container } = renderPage();

    expect(await screen.findByText('AI Rule')).toBeInTheDocument();
    expect(screen.getByText('Archive Rule')).toBeInTheDocument();
    expect(screen.getByText('2 conditions')).toBeInTheDocument();
    expect(screen.getByText('2 actions')).toBeInTheDocument();
    expect(screen.getByText('Ran 3 times')).toBeInTheDocument();
    expect(screen.getByText('Match any')).toBeInTheDocument();

    const ruleCards = container.querySelectorAll('.border.border-border.rounded-lg.p-4');
    const firstRuleButtons = within(ruleCards[0] as HTMLElement).getAllByRole('button');
    fireEvent.click(firstRuleButtons[0]);

    await waitFor(() => {
      expect(rulesApi.update).toHaveBeenCalledWith('rule-1', { enabled: false });
    });

    fireEvent.click(within(ruleCards[1] as HTMLElement).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(rulesApi.delete).toHaveBeenCalledWith('rule-2');
    });
  });

  it('validates and creates a new rule using the feed and tag select branches', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Rule' }));

    fireEvent.click(screen.getByRole('button', { name: 'Save Rule' }));
    expect(rulesApi.create).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('e.g. Save AI articles'), { target: { value: 'Route feed to tag' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Rule' }));
    expect(rulesApi.create).not.toHaveBeenCalled();

    let selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'any' } });
    fireEvent.change(selects[1], { target: { value: 'feed_id' } });
    fireEvent.change(selects[2], { target: { value: 'equals' } });

    selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[3], { target: { value: 'feed-1' } });

    fireEvent.click(screen.getByRole('button', { name: '+ Add action' }));

    selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[5], { target: { value: 'tag' } });

    selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[6], { target: { value: 'tag-1' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save Rule' }));

    await waitFor(() => {
      expect(rulesApi.create).toHaveBeenCalledWith({
        name: 'Route feed to tag',
        matchMode: 'any',
        conditions: [{ field: 'feed_id', op: 'equals', value: 'feed-1' }],
        actions: [{ type: 'star' }, { type: 'tag', tagId: 'tag-1' }],
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'New Rule' })).not.toBeInTheDocument();
    });
  });

  it('opens the edit flow, validates required fields, and saves through update', async () => {
    rulesApi.list.mockResolvedValue([
      {
        id: 'rule-9',
        userId: 'user-1',
        name: 'Existing Rule',
        enabled: true,
        priority: 1,
        conditions: [{ field: 'title', op: 'contains', value: 'React' }],
        actions: [{ type: 'star' }],
        matchMode: 'all',
        runCount: 0,
        lastRunAt: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]);

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(screen.getByText('Edit Rule')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save Rule' }));
    expect(rulesApi.update).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('e.g. Save AI articles'), { target: { value: 'Updated rule' } });
    fireEvent.change(screen.getByPlaceholderText('value...'), { target: { value: 'TypeScript' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Rule' }));

    await waitFor(() => {
      expect(rulesApi.update).toHaveBeenCalledWith('rule-9', {
        name: 'Updated rule',
        matchMode: 'all',
        conditions: [{ field: 'title', op: 'contains', value: 'TypeScript' }],
        actions: [{ type: 'star' }],
      });
    });

    await waitFor(() => {
      expect(screen.queryByText('Edit Rule')).not.toBeInTheDocument();
    });
  });

  it('removes extra conditions from the editor', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Rule' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Add condition' }));

    expect(screen.getAllByPlaceholderText('value...')).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'x' })[1]);
    expect(screen.getAllByPlaceholderText('value...')).toHaveLength(1);
  });

  it('uses empty tag and feed lists when hook data is unavailable and removes extra actions', async () => {
    useTagsMock.mockReturnValue({ data: undefined });
    useFeedsMock.mockReturnValue({ data: undefined });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'New Rule' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Add action' }));

    expect(screen.getAllByRole('button', { name: 'x' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'x' })[0]);
    expect(screen.queryByRole('button', { name: 'x' })).not.toBeInTheDocument();
  });
});
