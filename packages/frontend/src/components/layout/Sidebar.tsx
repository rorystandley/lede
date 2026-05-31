import { useState, useCallback } from 'react';
import { useFeeds, useSubscribeFeed } from '../../hooks/use-feeds.js';
import { useFolders, useCreateFolder } from '../../hooks/use-folders.js';
import { useTags, useCreateTag } from '../../hooks/use-tags.js';
import { useUiStore } from '../../stores/index.js';
import type { FolderWithCounts } from '@news-reader/shared';

interface SidebarProps {
  onOpenAddSources?: () => void;
}

export function Sidebar({ onOpenAddSources }: SidebarProps) {
  const {
    sidebarOpen, selectedFeedId, selectedFolderId, selectedTagId, showStarred,
    selectFeed, selectFolder, selectTag, setShowStarred,
    searchQuery, setSearchQuery, isSearching, setIsSearching, clearFilters,
  } = useUiStore();

  const { data: feedsData } = useFeeds();
  const { data: foldersData } = useFolders();
  const { data: tagsData } = useTags();
  const subscribeMut = useSubscribeFeed();
  const createFolderMut = useCreateFolder();
  const createTagMut = useCreateTag();

  const [showAddFeed, setShowAddFeed] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  const feeds = feedsData?.items ?? [];
  const folders = foldersData ?? [];
  const tags = tagsData ?? [];

  const handleSearch = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      setIsSearching(true);
    }
    if (e.key === 'Escape') {
      setSearchQuery('');
      setIsSearching(false);
    }
  }, [searchQuery, setIsSearching, setSearchQuery]);

  if (!sidebarOpen) return null;

  const ungroupedFeeds = feeds.filter((f) => !f.folderId);

  return (
    <aside className="w-64 border-r border-border bg-surface-secondary flex flex-col shrink-0 h-full overflow-hidden">
      <div className="p-3 border-b border-border">
        <input
          data-search-input
          type="text"
          placeholder="Search... (press /)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearch}
          className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        {isSearching && (
          <button
            onClick={() => { setSearchQuery(''); setIsSearching(false); }}
            className="mt-1.5 text-xs text-primary-600 hover:underline"
          >
            Clear search
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {/* Smart Feeds */}
        <div className="space-y-0.5 mb-4">
          <button
            onClick={() => clearFilters()}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 text-sm rounded ${
              !selectedFeedId && !selectedFolderId && !selectedTagId && !showStarred && !isSearching
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                : 'text-text-secondary hover:bg-surface-tertiary'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>
              All Articles
            </span>
            <span className="text-xs">{feeds.reduce((s, f) => s + f.unreadCount, 0) || ''}</span>
          </button>

          <button
            onClick={() => setShowStarred(true)}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-sm rounded ${
              showStarred ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-text-secondary hover:bg-surface-tertiary'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={showStarred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Starred
          </button>
        </div>

        {/* Folders */}
        {folders.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between px-2.5 mb-1">
              <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Folders</span>
            </div>
            <div className="space-y-0.5">
              {folders.map((folder) => (
                <FolderItem
                  key={folder.id}
                  folder={folder}
                  selectedFolderId={selectedFolderId}
                  onSelect={selectFolder}
                  feeds={feeds}
                  selectedFeedId={selectedFeedId}
                  onSelectFeed={selectFeed}
                />
              ))}
            </div>
          </div>
        )}

        {/* Feeds */}
        <div className="mb-4">
          <div className="flex items-center justify-between px-2.5 mb-1">
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Feeds</span>
            <div className="flex gap-1">
              <button onClick={() => setShowAddFolder(!showAddFolder)} className="text-text-tertiary hover:text-text-primary" title="New folder">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
              </button>
              <button onClick={() => setShowAddFeed(!showAddFeed)} className="text-text-tertiary hover:text-text-primary" title="Add feed">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            </div>
          </div>

          {showAddFolder && (
            <form className="px-2 mb-2" onSubmit={(e) => {
              e.preventDefault();
              if (!newFolderName.trim()) return;
              createFolderMut.mutate({ name: newFolderName.trim() }, {
                onSuccess: () => { setNewFolderName(''); setShowAddFolder(false); },
              });
            }}>
              <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Folder name..." autoFocus
                className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-primary-500 mb-1.5" />
              <button type="submit" disabled={createFolderMut.isPending} className="w-full px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">
                {createFolderMut.isPending ? 'Creating...' : 'Create Folder'}
              </button>
            </form>
          )}

          {showAddFeed && (
            <form className="px-2 mb-2" onSubmit={(e) => {
              e.preventDefault();
              if (!newUrl.trim()) return;
              subscribeMut.mutate({ url: newUrl.trim() }, {
                onSuccess: () => { setNewUrl(''); setShowAddFeed(false); },
              });
            }}>
              <input type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="Feed URL..." autoFocus
                className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-primary-500 mb-1.5" />
              <button type="submit" disabled={subscribeMut.isPending} className="w-full px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">
                {subscribeMut.isPending ? 'Adding...' : 'Add Feed'}
              </button>
              {subscribeMut.isError && <p className="text-xs text-red-500 mt-1">{subscribeMut.error?.message}</p>}
            </form>
          )}

          <div className="space-y-0.5">
            {ungroupedFeeds.map((feed) => (
              <FeedButton key={feed.id} feed={feed} isSelected={selectedFeedId === feed.id} onClick={() => selectFeed(feed.id)} />
            ))}
            {feeds.length === 0 && onOpenAddSources && (
              <button
                onClick={onOpenAddSources}
                className="w-full px-2.5 py-3 text-xs text-primary-600 hover:underline text-center"
              >
                Browse popular sources to get started
              </button>
            )}
          </div>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between px-2.5 mb-1">
              <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Tags</span>
              <button onClick={() => setShowAddTag(!showAddTag)} className="text-text-tertiary hover:text-text-primary" title="New tag">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            </div>
            {showAddTag && (
              <form className="px-2 mb-2" onSubmit={(e) => {
                e.preventDefault();
                if (!newTagName.trim()) return;
                createTagMut.mutate({ name: newTagName.trim() }, {
                  onSuccess: () => { setNewTagName(''); setShowAddTag(false); },
                });
              }}>
                <input type="text" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="Tag name..." autoFocus
                  className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-primary-500 mb-1.5" />
                <button type="submit" className="w-full px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700">Create Tag</button>
              </form>
            )}
            <div className="flex flex-wrap gap-1.5 px-2.5">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => selectTag(tag.id)}
                  className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                    selectedTagId === tag.id
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                      : 'bg-surface-tertiary text-text-secondary hover:bg-surface'
                  }`}
                  style={tag.color ? { borderLeft: `3px solid ${tag.color}` } : undefined}
                >
                  {tag.name}
                  {tag.articleCount > 0 && <span className="ml-1 text-text-tertiary">{tag.articleCount}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>

      {onOpenAddSources && (
        <div className="p-3 border-t border-border shrink-0">
          <button
            onClick={onOpenAddSources}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Sources
          </button>
        </div>
      )}
    </aside>
  );
}

function FolderItem({
  folder, selectedFolderId, onSelect, feeds, selectedFeedId, onSelectFeed,
}: {
  folder: FolderWithCounts;
  selectedFolderId: string | null;
  onSelect: (id: string) => void;
  feeds: { id: string; folderId: string | null; customTitle: string | null; title: string | null; url: string; faviconUrl: string | null; unreadCount: number }[];
  selectedFeedId: string | null;
  onSelectFeed: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const folderFeeds = feeds.filter((f) => f.folderId === folder.id);

  return (
    <div>
      <div className="flex items-center">
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 text-text-tertiary hover:text-text-primary"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <button
          onClick={() => onSelect(folder.id)}
          className={`flex-1 flex items-center justify-between px-1.5 py-1.5 text-sm rounded truncate ${
            selectedFolderId === folder.id
              ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
              : 'text-text-secondary hover:bg-surface-tertiary'
          }`}
        >
          <span className="truncate">{folder.name}</span>
          {folder.unreadCount > 0 && <span className="text-xs text-text-tertiary">{folder.unreadCount}</span>}
        </button>
      </div>
      {expanded && folderFeeds.length > 0 && (
        <div className="ml-5 space-y-0.5">
          {folderFeeds.map((feed) => (
            <FeedButton key={feed.id} feed={feed} isSelected={selectedFeedId === feed.id} onClick={() => onSelectFeed(feed.id)} />
          ))}
        </div>
      )}
      {expanded && folder.children.map((child) => (
        <div key={child.id} className="ml-3">
          <FolderItem folder={child} selectedFolderId={selectedFolderId} onSelect={onSelect} feeds={feeds} selectedFeedId={selectedFeedId} onSelectFeed={onSelectFeed} />
        </div>
      ))}
    </div>
  );
}

function FeedButton({ feed, isSelected, onClick }: {
  feed: { id: string; customTitle: string | null; title: string | null; url: string; faviconUrl: string | null; unreadCount: number };
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-sm rounded truncate ${
        isSelected ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-text-secondary hover:bg-surface-tertiary'
      }`}
    >
      {feed.faviconUrl ? (
        <img src={feed.faviconUrl} alt="" className="w-4 h-4 rounded" />
      ) : (
        <span className="w-4 h-4 rounded bg-primary-100 dark:bg-primary-800 flex items-center justify-center text-[10px] text-primary-600">
          {(feed.customTitle ?? feed.title ?? 'F')[0]}
        </span>
      )}
      <span className="truncate flex-1 text-left">{feed.customTitle ?? feed.title ?? feed.url}</span>
      {feed.unreadCount > 0 && <span className="text-xs text-text-tertiary">{feed.unreadCount}</span>}
    </button>
  );
}
