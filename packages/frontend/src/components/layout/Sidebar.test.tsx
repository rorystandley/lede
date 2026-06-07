import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar.js';

const mocks = vi.hoisted(() => ({
  useUiStoreMock: vi.fn(),
  useFeedsMock: vi.fn(),
  useSubscribeFeedMock: vi.fn(),
  useUnsubscribeFeedMock: vi.fn(),
  useUpdateFeedMock: vi.fn(),
  useRefreshFeedMock: vi.fn(),
  useFoldersMock: vi.fn(),
  useCreateFolderMock: vi.fn(),
  useDeleteFolderMock: vi.fn(),
  useTagsMock: vi.fn(),
  useCreateTagMock: vi.fn(),
  useDeleteTagMock: vi.fn(),
  useSavedSearchesMock: vi.fn(),
  useCreateSavedSearchMock: vi.fn(),
  useUpdateSavedSearchMock: vi.fn(),
  useDeleteSavedSearchMock: vi.fn(),
  folderUpdateMock: vi.fn(),
  tagUpdateMock: vi.fn(),
}));

vi.mock('../../hooks/use-feeds.js', () => ({
  useFeeds: () => mocks.useFeedsMock(),
  useSubscribeFeed: () => mocks.useSubscribeFeedMock(),
  useUnsubscribeFeed: () => mocks.useUnsubscribeFeedMock(),
  useUpdateFeed: () => mocks.useUpdateFeedMock(),
  useRefreshFeed: () => mocks.useRefreshFeedMock(),
}));

vi.mock('../../hooks/use-folders.js', () => ({
  useFolders: () => mocks.useFoldersMock(),
  useCreateFolder: () => mocks.useCreateFolderMock(),
  useDeleteFolder: () => mocks.useDeleteFolderMock(),
}));

vi.mock('../../hooks/use-tags.js', () => ({
  useTags: () => mocks.useTagsMock(),
  useCreateTag: () => mocks.useCreateTagMock(),
  useDeleteTag: () => mocks.useDeleteTagMock(),
}));

vi.mock('../../hooks/use-saved-searches.js', () => ({
  useSavedSearches: () => mocks.useSavedSearchesMock(),
  useCreateSavedSearch: () => mocks.useCreateSavedSearchMock(),
  useUpdateSavedSearch: () => mocks.useUpdateSavedSearchMock(),
  useDeleteSavedSearch: () => mocks.useDeleteSavedSearchMock(),
}));

vi.mock('../../stores/index.js', () => ({
  useUiStore: () => mocks.useUiStoreMock(),
}));

vi.mock('../../api/folders.api.js', () => ({
  foldersApi: {
    update: mocks.folderUpdateMock,
  },
}));

vi.mock('../../api/tags.api.js', () => ({
  tagsApi: {
    update: mocks.tagUpdateMock,
  },
}));

vi.mock('../shared/ContextMenu.js', () => ({
  ContextMenu: ({ items, onClose }: { items: Array<{ label: string; onClick?: () => void; children?: Array<{ label: string; value: number | string }> ; onChildClick?: (value: number | string) => void }>; onClose: () => void }) => (
    <div data-testid="context-menu">
      {items.map((item) => (
        <div key={item.label}>
          <button
            type="button"
            onClick={() => {
              item.onClick?.();
              onClose();
            }}
          >
            {item.label}
          </button>
          {item.children?.map((child) => (
            <button
              key={`${item.label}-${child.label}`}
              type="button"
              onClick={() => {
                item.onChildClick?.(child.value);
                onClose();
              }}
            >
              {child.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../shared/InlineEdit.js', () => ({
  InlineEdit: ({ value, onSave, onCancel }: { value: string; onSave: (value: string) => void; onCancel: () => void }) => (
    <div>
      <span>{value}</span>
      <button type="button" onClick={() => onSave(`${value} updated`)}>Inline Save</button>
      <button type="button" onClick={onCancel}>Inline Cancel</button>
    </div>
  ),
}));

vi.mock('../shared/FolderPicker.js', () => ({
  FolderPicker: ({ folders, value, onChange }: { folders: Array<{ id: string; name: string }>; value: string | null; onChange: (value: string | null) => void }) => (
    <select
      aria-label="Folder Picker"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">No folder</option>
      {folders.map((folder) => (
        <option key={folder.id} value={folder.id}>
          {folder.name}
        </option>
      ))}
    </select>
  ),
}));

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithClient(ui: React.ReactElement) {
  const client = createClient();
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return {
    client,
    ...render(ui, { wrapper: Wrapper }),
  };
}

function buildUiState(overrides: Record<string, unknown> = {}) {
  return {
    sidebarOpen: true,
    setSidebarOpen: vi.fn(),
    selectedFeedId: null,
    selectedFolderId: null,
    selectedTagId: null,
    showStarred: false,
    selectFeed: vi.fn(),
    selectFolder: vi.fn(),
    selectTag: vi.fn(),
    setShowStarred: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
    isSearching: false,
    setIsSearching: vi.fn(),
    clearFilters: vi.fn(),
    ...overrides,
  };
}

function buildFolder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'folder-1',
    name: 'Tech',
    unreadCount: 3,
    children: [],
    ...overrides,
  };
}

function buildFeed(overrides: Record<string, unknown> = {}) {
  return {
    id: 'feed-1',
    folderId: null,
    customTitle: null,
    title: 'Example Feed',
    url: 'https://example.com/rss.xml',
    faviconUrl: null,
    feedType: 'rss',
    unreadCount: 4,
    refreshInterval: 60,
    ...overrides,
  };
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const createFolderMutate = vi.fn((_payload, options) => options?.onSuccess?.());
    const subscribeMutate = vi.fn((_payload, options) => options?.onSuccess?.());
    const createTagMutate = vi.fn((_payload, options) => options?.onSuccess?.());

    mocks.useUiStoreMock.mockReturnValue(buildUiState());
    mocks.useFeedsMock.mockReturnValue({ data: { items: [buildFeed()] } });
    mocks.useSubscribeFeedMock.mockReturnValue({ mutate: subscribeMutate, isPending: false, isError: false, error: null });
    mocks.useUnsubscribeFeedMock.mockReturnValue({ mutate: vi.fn() });
    mocks.useUpdateFeedMock.mockReturnValue({ mutate: vi.fn() });
    mocks.useRefreshFeedMock.mockReturnValue({ mutate: vi.fn() });
    mocks.useFoldersMock.mockReturnValue({ data: [buildFolder()] });
    mocks.useCreateFolderMock.mockReturnValue({ mutate: createFolderMutate, isPending: false });
    mocks.useDeleteFolderMock.mockReturnValue({ mutate: vi.fn() });
    mocks.useTagsMock.mockReturnValue({ data: [{ id: 'tag-1', name: 'AI', color: '#ff0000', articleCount: 2 }] });
    mocks.useCreateTagMock.mockReturnValue({ mutate: createTagMutate });
    mocks.useDeleteTagMock.mockReturnValue({ mutate: vi.fn() });
    mocks.useSavedSearchesMock.mockReturnValue({ data: [{ id: 'saved-1', name: 'Digest', query: 'ai', isMonitor: true }] });
    mocks.useCreateSavedSearchMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mocks.useUpdateSavedSearchMock.mockReturnValue({ mutate: vi.fn() });
    mocks.useDeleteSavedSearchMock.mockReturnValue({ mutate: vi.fn() });
    mocks.folderUpdateMock.mockResolvedValue(undefined);
    mocks.tagUpdateMock.mockResolvedValue(undefined);

    vi.spyOn(window, 'prompt').mockReturnValue('Saved query');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('returns null when the sidebar is closed', () => {
    mocks.useUiStoreMock.mockReturnValue(buildUiState({ sidebarOpen: false }));

    const { container } = renderWithClient(<Sidebar />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nested child folders and allows selecting them', async () => {
    const user = userEvent.setup();
    const uiState = buildUiState();
    mocks.useUiStoreMock.mockReturnValue(uiState);
    mocks.useFoldersMock.mockReturnValue({
      data: [
        buildFolder({
          children: [
            buildFolder({
              id: 'folder-child',
              name: 'Child Folder',
              unreadCount: 1,
            }),
          ],
        }),
      ],
    });

    renderWithClient(<Sidebar />);

    await user.click(screen.getByRole('button', { name: 'Child Folder' }));
    expect(uiState.selectFolder).toHaveBeenCalledWith('folder-child');
  });

  it('handles smart feeds, search keyboard shortcuts, and saved search execution', async () => {
    const user = userEvent.setup();
    const uiState = buildUiState({
      searchQuery: 'react',
      isSearching: true,
      selectedFeedId: 'feed-selected',
    });
    mocks.useUiStoreMock.mockReturnValue(uiState);

    renderWithClient(<Sidebar />);

    await user.click(screen.getByRole('button', { name: /All Articles/i }));
    expect(uiState.clearFilters).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Starred/i }));
    expect(uiState.setShowStarred).toHaveBeenCalledWith(true);

    const searchInput = screen.getByPlaceholderText('Search... (press /)');
    await user.type(searchInput, '{enter}');
    expect(uiState.setIsSearching).toHaveBeenCalledWith(true);

    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(uiState.setSearchQuery).toHaveBeenCalledWith('');
    expect(uiState.setIsSearching).toHaveBeenCalledWith(false);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(mocks.useCreateSavedSearchMock().mutate).toHaveBeenCalledWith({ name: 'Saved query', query: 'react' });

    await user.click(screen.getByRole('button', { name: /Digest/i }));
    expect(uiState.setSearchQuery).toHaveBeenCalledWith('ai');
    expect(uiState.setIsSearching).toHaveBeenCalledWith(true);
    expect(screen.getByLabelText('Monitored')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /AI 2/i }));
    expect(uiState.selectTag).toHaveBeenCalledWith('tag-1');
  });

  it('supports creating folders, feeds, and tags, and shows the empty-feed CTA', async () => {
    const user = userEvent.setup();
    const onOpenAddSources = vi.fn();

    mocks.useFeedsMock.mockReturnValue({ data: { items: [] } });
    const subscribeMutate = vi.fn((_payload, options) => options?.onSuccess?.());
    const createFolderMutate = vi.fn((_payload, options) => options?.onSuccess?.());
    const createTagMutate = vi.fn((_payload, options) => options?.onSuccess?.());
    mocks.useSubscribeFeedMock.mockReturnValue({ mutate: subscribeMutate, isPending: false, isError: false, error: null });
    mocks.useCreateFolderMock.mockReturnValue({ mutate: createFolderMutate, isPending: false });
    mocks.useCreateTagMock.mockReturnValue({ mutate: createTagMutate });

    renderWithClient(<Sidebar onOpenAddSources={onOpenAddSources} />);

    await user.click(screen.getByRole('button', { name: /Browse popular sources to get started/i }));
    expect(onOpenAddSources).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Add Sources/i }));
    expect(onOpenAddSources).toHaveBeenCalledTimes(2);

    await user.click(screen.getByTitle('New folder'));
    await user.type(screen.getByPlaceholderText('Folder name...'), 'Work');
    await user.click(screen.getByRole('button', { name: 'Create Folder' }));
    expect(createFolderMutate).toHaveBeenCalledWith({ name: 'Work' }, expect.any(Object));

    await user.click(screen.getByTitle('Add feed by URL'));
    await user.type(screen.getByPlaceholderText('Feed URL...'), 'https://site.test/feed.xml');
    await user.selectOptions(screen.getByLabelText('Folder Picker'), 'folder-1');
    await user.click(screen.getByRole('button', { name: 'Add Feed' }));
    expect(subscribeMutate).toHaveBeenCalledWith(
      { url: 'https://site.test/feed.xml', folderId: 'folder-1' },
      expect.any(Object),
    );

    await user.click(screen.getByTitle('New tag'));
    await user.type(screen.getByPlaceholderText('Tag name...'), 'Priority');
    await user.click(screen.getByRole('button', { name: 'Create Tag' }));
    expect(createTagMutate).toHaveBeenCalledWith({ name: 'Priority' }, expect.any(Object));
  });

  it('renders folders and feeds, supports selection, inline edit, and feed drag/drop behavior', async () => {
    const user = userEvent.setup();
    const uiState = buildUiState();
    const updateFeedMutate = vi.fn();
    mocks.useUiStoreMock.mockReturnValue(uiState);
    mocks.useFeedsMock.mockReturnValue({
      data: {
        items: [
          buildFeed({ id: 'feed-ungrouped', title: 'Ungrouped Feed', unreadCount: 1 }),
          buildFeed({ id: 'feed-in-folder', title: 'Folder Feed', folderId: 'folder-1', feedType: 'atom' }),
        ],
      },
    });
    mocks.useUpdateFeedMock.mockReturnValue({ mutate: updateFeedMutate });

    const { client } = renderWithClient(<Sidebar />);
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    await user.click(screen.getByRole('button', { name: /Tech/i }));
    expect(uiState.selectFolder).toHaveBeenCalledWith('folder-1');

    await user.click(screen.getByRole('button', { name: /Ungrouped Feed/i }));
    expect(uiState.selectFeed).toHaveBeenCalledWith('feed-ungrouped');

    fireEvent.contextMenu(screen.getByRole('button', { name: /Tech/i }), { clientX: 10, clientY: 20 });
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.click(screen.getByRole('button', { name: 'Inline Save' }));
    await waitFor(() => {
      expect(mocks.folderUpdateMock).toHaveBeenCalledWith('folder-1', { name: 'Tech updated' });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['folders'] });

    const folderDropZone = screen.getByRole('button', { name: /Tech/i }).closest('div');
    fireEvent.drop(folderDropZone as Element, {
      dataTransfer: {
        getData: () => 'feed-ungrouped',
      },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    expect(updateFeedMutate).toHaveBeenCalledWith({ feedId: 'feed-ungrouped', data: { folderId: 'folder-1' } });
  });

  it('opens context menus for feeds, tags, and saved searches and runs their actions', async () => {
    const user = userEvent.setup();
    const updateFeedMutate = vi.fn();
    const refreshFeedMutate = vi.fn();
    const unsubscribeFeedMutate = vi.fn();
    const updateSavedSearchMutate = vi.fn();
    const deleteSavedSearchMutate = vi.fn();
    const deleteTagMutate = vi.fn();

    mocks.useUpdateFeedMock.mockReturnValue({ mutate: updateFeedMutate });
    mocks.useRefreshFeedMock.mockReturnValue({ mutate: refreshFeedMutate });
    mocks.useUnsubscribeFeedMock.mockReturnValue({ mutate: unsubscribeFeedMutate });
    mocks.useUpdateSavedSearchMock.mockReturnValue({ mutate: updateSavedSearchMutate });
    mocks.useDeleteSavedSearchMock.mockReturnValue({ mutate: deleteSavedSearchMutate });
    mocks.useDeleteTagMock.mockReturnValue({ mutate: deleteTagMutate });
    vi.mocked(window.prompt).mockReturnValue('Tech');

    renderWithClient(<Sidebar />);

    fireEvent.contextMenu(screen.getByRole('button', { name: /Example Feed/i }), { clientX: 10, clientY: 20 });
    await user.click(screen.getByRole('button', { name: 'Move to folder...' }));
    expect(updateFeedMutate).toHaveBeenCalledWith({ feedId: 'feed-1', data: { folderId: 'folder-1' } });

    fireEvent.contextMenu(screen.getByRole('button', { name: /Example Feed/i }), { clientX: 10, clientY: 20 });
    await user.click(screen.getByRole('button', { name: '15 minutes' }));
    expect(updateFeedMutate).toHaveBeenCalledWith({ feedId: 'feed-1', data: { refreshInterval: 15 } });

    fireEvent.contextMenu(screen.getByRole('button', { name: /Example Feed/i }), { clientX: 10, clientY: 20 });
    await user.click(screen.getByRole('button', { name: 'Refresh now' }));
    expect(refreshFeedMutate).toHaveBeenCalledWith('feed-1');

    fireEvent.contextMenu(screen.getByRole('button', { name: /Example Feed/i }), { clientX: 10, clientY: 20 });
    await user.click(screen.getByRole('button', { name: 'Unsubscribe' }));
    expect(unsubscribeFeedMutate).toHaveBeenCalledWith('feed-1');

    fireEvent.contextMenu(screen.getByRole('button', { name: /AI 2/i }), { clientX: 10, clientY: 20 });
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.click(screen.getByRole('button', { name: 'Inline Save' }));
    await waitFor(() => {
      expect(mocks.tagUpdateMock).toHaveBeenCalledWith('tag-1', { name: 'AI updated' });
    });

    fireEvent.contextMenu(screen.getByRole('button', { name: /AI 2/i }), { clientX: 10, clientY: 20 });
    await user.click(screen.getByRole('button', { name: 'Delete tag' }));
    expect(deleteTagMutate).toHaveBeenCalledWith('tag-1');

    fireEvent.contextMenu(screen.getByRole('button', { name: /Digest/i }), { clientX: 10, clientY: 20 });
    await user.click(screen.getByRole('button', { name: 'Disable monitor' }));
    expect(updateSavedSearchMutate).toHaveBeenCalledWith({ id: 'saved-1', data: { isMonitor: false } });

    fireEvent.contextMenu(screen.getByRole('button', { name: /Digest/i }), { clientX: 10, clientY: 20 });
    await user.click(screen.getByRole('button', { name: 'Delete saved search' }));
    expect(deleteSavedSearchMutate).toHaveBeenCalledWith('saved-1');
  });

  it('covers cancel flows and empty states without mutating', async () => {
    const user = userEvent.setup();
    const createSavedSearchMutate = vi.fn();
    const createFolderMutate = vi.fn();
    const createTagMutate = vi.fn();

    mocks.useUiStoreMock.mockReturnValue(buildUiState({ searchQuery: 'react', isSearching: true }));
    mocks.useTagsMock.mockReturnValue({ data: [] });
    mocks.useCreateSavedSearchMock.mockReturnValue({ mutate: createSavedSearchMutate, isPending: false });
    mocks.useCreateFolderMock.mockReturnValue({ mutate: createFolderMutate, isPending: false });
    mocks.useCreateTagMock.mockReturnValue({ mutate: createTagMutate });
    vi.mocked(window.prompt).mockReturnValue(null);

    renderWithClient(<Sidebar />);

    expect(screen.getByText('No tags yet')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(createSavedSearchMutate).not.toHaveBeenCalled();

    await user.click(screen.getByTitle('New folder'));
    const folderInput = screen.getByPlaceholderText('Folder name...');
    await user.type(folderInput, 'Work');
    fireEvent.keyDown(folderInput, { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Folder name...')).not.toBeInTheDocument();
    expect(createFolderMutate).not.toHaveBeenCalled();

    await user.click(screen.getByTitle('New tag'));
    await user.type(screen.getByPlaceholderText('Tag name...'), 'Priority');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByPlaceholderText('Tag name...')).not.toBeInTheDocument();
    expect(createTagMutate).not.toHaveBeenCalled();
  });

  it('renders folder feed variants and supports collapse, drag, and feed rename flows', async () => {
    const user = userEvent.setup();
    const updateFeedMutate = vi.fn();

    mocks.useUiStoreMock.mockReturnValue(buildUiState({ selectedFolderId: 'folder-1' }));
    mocks.useFeedsMock.mockReturnValue({
      data: {
        items: [
          buildFeed({ id: 'feed-ungrouped', title: 'Ungrouped Feed', unreadCount: 1 }),
          buildFeed({
            id: 'feed-in-folder',
            folderId: 'folder-1',
            customTitle: 'Daily Brief',
            title: null,
            faviconUrl: 'https://example.com/favicon.ico',
            feedType: 'newsletter',
            unreadCount: 0,
          }),
        ],
      },
    });
    mocks.useUpdateFeedMock.mockReturnValue({ mutate: updateFeedMutate });

    const { container } = renderWithClient(<Sidebar />);

    expect(screen.getByTitle('Daily Brief (Newsletter)')).toBeInTheDocument();
    expect(screen.getByText('Newsletter')).toBeInTheDocument();
    expect(container.querySelector('img[src="https://example.com/favicon.ico"]')).toBeInTheDocument();

    const folderButton = screen.getByRole('button', { name: /Tech/i });
    const folderRow = folderButton.parentElement as HTMLElement;
    const toggleButton = folderRow.querySelectorAll('button')[0] as HTMLButtonElement;

    await user.click(toggleButton);
    expect(screen.queryByTitle('Daily Brief (Newsletter)')).not.toBeInTheDocument();

    await user.click(toggleButton);
    const folderFeedButton = screen.getByTitle('Daily Brief (Newsletter)');
    expect(folderFeedButton).toBeInTheDocument();

    fireEvent.contextMenu(folderFeedButton, { clientX: 10, clientY: 20 });
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.click(screen.getByRole('button', { name: 'Inline Cancel' }));
    expect(updateFeedMutate).not.toHaveBeenCalled();

    fireEvent.contextMenu(screen.getByRole('button', { name: /Ungrouped Feed/i }), { clientX: 10, clientY: 20 });
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.click(screen.getByRole('button', { name: 'Inline Cancel' }));
    expect(updateFeedMutate).not.toHaveBeenCalled();

    const setData = vi.fn();
    const dataTransfer = { setData, effectAllowed: 'none' } as unknown as DataTransfer;
    fireEvent.dragStart(screen.getByTitle('Daily Brief (Newsletter)'), { dataTransfer });
    expect(setData).toHaveBeenCalledWith('feedId', 'feed-in-folder');
    expect(dataTransfer.effectAllowed).toBe('move');

    const ungroupedZone = screen.getByRole('button', { name: /Ungrouped Feed/i }).parentElement as HTMLElement;
    fireEvent.dragOver(ungroupedZone, { preventDefault: vi.fn() });
    expect(ungroupedZone.className).toContain('ring-1');

    fireEvent.dragLeave(ungroupedZone);
    expect(ungroupedZone.className).not.toContain('ring-1');

    fireEvent.drop(ungroupedZone, {
      dataTransfer: { getData: () => 'feed-in-folder' },
      preventDefault: vi.fn(),
    });
    expect(updateFeedMutate).toHaveBeenCalledWith({ feedId: 'feed-in-folder', data: { folderId: null } });

    fireEvent.contextMenu(screen.getByTitle('Daily Brief (Newsletter)'), { clientX: 10, clientY: 20 });
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.click(screen.getByRole('button', { name: 'Inline Save' }));
    expect(updateFeedMutate).toHaveBeenCalledWith({ feedId: 'feed-in-folder', data: { customTitle: 'Daily Brief updated' } });
  });

  it('handles remove-from-folder, folder delete, saved search enable, and confirm cancel branches', async () => {
    const user = userEvent.setup();
    const updateFeedMutate = vi.fn();
    const unsubscribeFeedMutate = vi.fn();
    const updateSavedSearchMutate = vi.fn();
    const deleteFolderMutate = vi.fn();

    mocks.useFeedsMock.mockReturnValue({
      data: {
        items: [
          buildFeed({ id: 'feed-in-folder', title: 'Folder Feed', folderId: 'folder-1' }),
        ],
      },
    });
    mocks.useSavedSearchesMock.mockReturnValue({ data: [{ id: 'saved-1', name: 'Digest', query: 'ai', isMonitor: false }] });
    mocks.useUpdateFeedMock.mockReturnValue({ mutate: updateFeedMutate });
    mocks.useUnsubscribeFeedMock.mockReturnValue({ mutate: unsubscribeFeedMutate });
    mocks.useUpdateSavedSearchMock.mockReturnValue({ mutate: updateSavedSearchMutate });
    mocks.useDeleteFolderMock.mockReturnValue({ mutate: deleteFolderMutate });
    vi.mocked(window.confirm)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    renderWithClient(<Sidebar />);

    fireEvent.contextMenu(screen.getByTitle('Folder Feed (RSS)'), { clientX: 10, clientY: 20 });
    await user.click(screen.getByRole('button', { name: 'Remove from folder' }));
    expect(updateFeedMutate).toHaveBeenCalledWith({ feedId: 'feed-in-folder', data: { folderId: null } });

    fireEvent.contextMenu(screen.getByRole('button', { name: /Tech/i }), { clientX: 10, clientY: 20 });
    await user.click(screen.getByRole('button', { name: 'Delete folder' }));
    expect(deleteFolderMutate).not.toHaveBeenCalled();

    fireEvent.contextMenu(screen.getByRole('button', { name: /Tech/i }), { clientX: 10, clientY: 20 });
    await user.click(screen.getByRole('button', { name: 'Delete folder' }));
    expect(deleteFolderMutate).toHaveBeenCalledWith('folder-1');

    fireEvent.contextMenu(screen.getByRole('button', { name: /Digest/i }), { clientX: 10, clientY: 20 });
    await user.click(screen.getByRole('button', { name: 'Enable monitor' }));
    expect(updateSavedSearchMutate).toHaveBeenCalledWith({ id: 'saved-1', data: { isMonitor: true } });

    fireEvent.contextMenu(screen.getByTitle('Folder Feed (RSS)'), { clientX: 10, clientY: 20 });
    await user.click(screen.getByRole('button', { name: 'Unsubscribe' }));
    expect(unsubscribeFeedMutate).not.toHaveBeenCalled();
  });

  it('covers pending, empty, and fallback sidebar states without crashing', async () => {
    const user = userEvent.setup();
    const uiState = buildUiState({
      showStarred: true,
      selectedTagId: 'tag-plain',
      searchQuery: 'digest',
      isSearching: true,
    });

    mocks.useUiStoreMock.mockReturnValue(uiState);
    mocks.useFeedsMock.mockReturnValue({ data: undefined });
    mocks.useFoldersMock.mockReturnValue({ data: undefined });
    mocks.useTagsMock.mockReturnValue({ data: [{ id: 'tag-plain', name: 'Plain', color: null, articleCount: 0 }] });
    mocks.useSavedSearchesMock.mockReturnValue({ data: [{ id: 'saved-1', name: 'Digest', query: 'digest', isMonitor: false }] });
    mocks.useCreateSavedSearchMock.mockReturnValue({ mutate: vi.fn(), isPending: true });
    mocks.useCreateFolderMock.mockReturnValue({ mutate: vi.fn(), isPending: true });
    mocks.useSubscribeFeedMock.mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
      isError: true,
      error: new Error('Feed failed'),
    });
    mocks.useCreateTagMock.mockReturnValue({ mutate: vi.fn() });

    renderWithClient(<Sidebar />);

    expect(screen.getByRole('button', { name: /Starred/i }).querySelector('svg')).toHaveAttribute('fill', 'currentColor');
    expect(screen.getByRole('button', { name: /Digest/i })).toHaveClass('bg-primary-50');
    expect(screen.getByRole('button', { name: /Plain/i })).toHaveClass('bg-primary-100');
    expect(screen.getByText('Saving...')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(uiState.setSearchQuery).toHaveBeenCalledWith('');
    expect(uiState.setIsSearching).toHaveBeenCalledWith(false);

    await user.click(screen.getByTitle('New folder'));
    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByTitle('Add feed by URL'));
    expect(screen.getByRole('button', { name: 'Adding...' })).toBeDisabled();
    expect(screen.getByText('Feed failed')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByPlaceholderText('Feed URL...'), { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Feed URL...')).not.toBeInTheDocument();
  });

  it('covers blank submissions, input changes, and folderless feed menus', async () => {
    const user = userEvent.setup();
    const uiState = buildUiState({
      searchQuery: '   ',
      isSearching: true,
    });
    const createSavedSearchMutate = vi.fn();
    const createFolderMutate = vi.fn();
    const subscribeMutate = vi.fn();
    const createTagMutate = vi.fn();
    const updateFeedMutate = vi.fn();

    mocks.useUiStoreMock.mockReturnValue(uiState);
    mocks.useFoldersMock.mockReturnValue({ data: [] });
    mocks.useTagsMock.mockReturnValue({ data: undefined });
    mocks.useSavedSearchesMock.mockReturnValue({ data: undefined });
    mocks.useFeedsMock.mockReturnValue({
      data: {
        items: [
          buildFeed({
            id: 'feed-url-fallback',
            title: null,
            customTitle: null,
            url: 'https://fallback.example/rss',
          }),
        ],
      },
    });
    mocks.useCreateSavedSearchMock.mockReturnValue({ mutate: createSavedSearchMutate, isPending: false });
    mocks.useCreateFolderMock.mockReturnValue({ mutate: createFolderMutate, isPending: false });
    mocks.useSubscribeFeedMock.mockReturnValue({ mutate: subscribeMutate, isPending: false, isError: false, error: null });
    mocks.useCreateTagMock.mockReturnValue({ mutate: createTagMutate });
    mocks.useUpdateFeedMock.mockReturnValue({ mutate: updateFeedMutate });

    renderWithClient(<Sidebar />);

    fireEvent.change(screen.getByPlaceholderText('Search... (press /)'), { target: { value: 'latest' } });
    expect(uiState.setSearchQuery).toHaveBeenCalledWith('latest');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(createSavedSearchMutate).not.toHaveBeenCalled();

    await user.click(screen.getByTitle('New folder'));
    await user.click(screen.getByRole('button', { name: 'Create Folder' }));
    expect(createFolderMutate).not.toHaveBeenCalled();

    await user.click(screen.getByTitle('Add feed by URL'));
    expect(screen.queryByLabelText('Folder Picker')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add Feed' }));
    expect(subscribeMutate).not.toHaveBeenCalled();
    await user.type(screen.getByPlaceholderText('Feed URL...'), 'https://plain.example/rss');
    await user.click(screen.getAllByRole('button', { name: 'Cancel' })[1]);
    expect(screen.queryByPlaceholderText('Feed URL...')).not.toBeInTheDocument();

    await user.click(screen.getByTitle('New tag'));
    await user.click(screen.getByRole('button', { name: 'Create Tag' }));
    expect(createTagMutate).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByPlaceholderText('Tag name...'), { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Tag name...')).not.toBeInTheDocument();

    const fallbackFeed = screen.getByTitle('https://fallback.example/rss (RSS)');
    fireEvent.contextMenu(fallbackFeed, { clientX: 5, clientY: 5 });
    await user.click(screen.getByRole('button', { name: 'Refresh interval' }));
    expect(updateFeedMutate).not.toHaveBeenCalled();
  });

  it('covers folder-feed selection, drag-over styling, and tag inline cancel', async () => {
    const user = userEvent.setup();
    const uiState = buildUiState({
      selectedFeedId: 'feed-in-folder',
    });
    const updateFeedMutate = vi.fn();
    mocks.useUiStoreMock.mockReturnValue(uiState);
    mocks.useFeedsMock.mockReturnValue({
      data: {
        items: [
          buildFeed({
            id: 'feed-in-folder',
            folderId: 'folder-1',
            title: null,
            customTitle: null,
            url: 'https://folder.example/rss',
          }),
        ],
      },
    });
    mocks.useUpdateFeedMock.mockReturnValue({ mutate: updateFeedMutate });

    renderWithClient(<Sidebar />);

    const folderFeed = screen.getByTitle('https://folder.example/rss (RSS)');
    await user.click(folderFeed);
    expect(uiState.selectFeed).toHaveBeenCalledWith('feed-in-folder');

    const folderRow = screen.getByRole('button', { name: /Tech/i }).parentElement as HTMLElement;
    fireEvent.dragOver(folderRow, { preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(folderRow.className).toContain('ring-1');
    fireEvent.dragLeave(folderRow, { stopPropagation: vi.fn() });
    expect(folderRow.className).not.toContain('ring-1');

    fireEvent.contextMenu(screen.getByRole('button', { name: /AI 2/i }), { clientX: 10, clientY: 20 });
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.click(screen.getByRole('button', { name: 'Inline Cancel' }));
    expect(mocks.tagUpdateMock).not.toHaveBeenCalled();

    fireEvent.contextMenu(folderFeed, { clientX: 10, clientY: 20 });
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.click(screen.getByRole('button', { name: 'Inline Save' }));
    expect(updateFeedMutate).toHaveBeenCalledWith({
      feedId: 'feed-in-folder',
      data: { customTitle: ' updated' },
    });
  });

  it('submits folderless feeds and renames fallback feeds from both feed sections', async () => {
    const user = userEvent.setup();
    const subscribeMutate = vi.fn((_payload, options) => options?.onSuccess?.());
    const updateFeedMutate = vi.fn();

    mocks.useFeedsMock.mockReturnValue({
      data: {
        items: [
          buildFeed({
            id: 'feed-ungrouped-fallback',
            title: null,
            customTitle: null,
            url: 'https://ungrouped.example/rss',
          }),
          buildFeed({
            id: 'feed-folder-fallback',
            folderId: 'folder-1',
            title: null,
            customTitle: null,
            url: 'https://folder.example/rss',
          }),
        ],
      },
    });
    mocks.useSubscribeFeedMock.mockReturnValue({ mutate: subscribeMutate, isPending: false, isError: false, error: null });
    mocks.useUpdateFeedMock.mockReturnValue({ mutate: updateFeedMutate });

    renderWithClient(<Sidebar />);

    await user.click(screen.getByTitle('Add feed by URL'));
    await user.type(screen.getByPlaceholderText('Feed URL...'), 'https://folderless.example/rss');
    await user.click(screen.getByRole('button', { name: 'Add Feed' }));
    expect(subscribeMutate).toHaveBeenCalledWith(
      { url: 'https://folderless.example/rss', folderId: undefined },
      expect.any(Object),
    );

    fireEvent.contextMenu(screen.getByTitle('https://ungrouped.example/rss (RSS)'), { clientX: 5, clientY: 5 });
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.click(screen.getByRole('button', { name: 'Inline Save' }));
    expect(updateFeedMutate).toHaveBeenCalledWith({
      feedId: 'feed-ungrouped-fallback',
      data: { customTitle: ' updated' },
    });

    fireEvent.contextMenu(screen.getByTitle('https://folder.example/rss (RSS)'), { clientX: 5, clientY: 5 });
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.click(screen.getByRole('button', { name: 'Inline Save' }));
    expect(updateFeedMutate).toHaveBeenCalledWith({
      feedId: 'feed-folder-fallback',
      data: { customTitle: ' updated' },
    });
  });
});
