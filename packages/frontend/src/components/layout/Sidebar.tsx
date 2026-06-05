import { useState, useCallback } from 'react';
import { useFeeds, useSubscribeFeed, useUnsubscribeFeed, useUpdateFeed, useRefreshFeed } from '../../hooks/use-feeds.js';
import { useFolders, useCreateFolder, useDeleteFolder } from '../../hooks/use-folders.js';
import { useTags, useCreateTag, useDeleteTag } from '../../hooks/use-tags.js';
import { useSavedSearches, useCreateSavedSearch, useUpdateSavedSearch, useDeleteSavedSearch } from '../../hooks/use-saved-searches.js';
import { useUiStore } from '../../stores/index.js';
import { foldersApi } from '../../api/folders.api.js';
import { tagsApi } from '../../api/tags.api.js';
import { useQueryClient } from '@tanstack/react-query';
import { ContextMenu } from '../shared/ContextMenu.js';
import { InlineEdit } from '../shared/InlineEdit.js';
import { FolderPicker } from '../shared/FolderPicker.js';
import type { FolderWithCounts } from '@news-reader/shared';

interface SidebarProps { onOpenAddSources?: () => void; }
interface MenuState { x: number; y: number; type: 'feed' | 'folder' | 'tag' | 'saved-search'; id: string; name: string; extra?: Record<string, unknown>; }

export function Sidebar({ onOpenAddSources }: SidebarProps) {
  const { sidebarOpen, selectedFeedId, selectedFolderId, selectedTagId, showStarred, selectFeed, selectFolder, selectTag, setShowStarred, searchQuery, setSearchQuery, isSearching, setIsSearching, clearFilters } = useUiStore();
  const qc = useQueryClient();
  const { data: feedsData } = useFeeds();
  const { data: foldersData } = useFolders();
  const { data: tagsData } = useTags();
  const subscribeMut = useSubscribeFeed();
  const unsubscribeMut = useUnsubscribeFeed();
  const updateFeedMut = useUpdateFeed();
  const refreshFeedMut = useRefreshFeed();
  const createFolderMut = useCreateFolder();
  const deleteFolderMut = useDeleteFolder();
  const createTagMut = useCreateTag();
  const deleteTagMut = useDeleteTag();
  const { data: savedSearchesData } = useSavedSearches();
  const createSavedSearchMut = useCreateSavedSearch();
  const updateSavedSearchMut = useUpdateSavedSearch();
  const deleteSavedSearchMut = useDeleteSavedSearch();

  const [showAddFeed, setShowAddFeed] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newFeedFolder, setNewFeedFolder] = useState<string | null>(null);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [editing, setEditing] = useState<{ type: string; id: string } | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const feeds = feedsData?.items ?? [];
  const folders = foldersData ?? [];
  const tags = tagsData ?? [];
  const savedSearches = savedSearchesData ?? [];

  const handleSearch = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) setIsSearching(true);
    if (e.key === 'Escape') { setSearchQuery(''); setIsSearching(false); }
  }, [searchQuery, setIsSearching, setSearchQuery]);

  const handleSaveSearch = useCallback(() => {
    if (!searchQuery.trim()) return;
    const name = prompt('Name for this saved search:', searchQuery.trim());
    if (!name) return;
    createSavedSearchMut.mutate({ name, query: searchQuery.trim() });
  }, [searchQuery, createSavedSearchMut]);

  const handleExecuteSavedSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setIsSearching(true);
  }, [setSearchQuery, setIsSearching]);

  const openMenu = (e: React.MouseEvent, type: MenuState['type'], id: string, name: string, extra?: Record<string, unknown>) => {
    e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, type, id, name, extra });
  };

  const handleDrop = (feedId: string, targetFolderId: string | null) => {
    updateFeedMut.mutate({ feedId, data: { folderId: targetFolderId } });
    setDragOverFolder(null);
  };

  if (!sidebarOpen) return null;
  const ungroupedFeeds = feeds.filter((f) => !f.folderId);

  const feedMenuItems = menu?.type === 'feed' ? [
    { label: 'Rename', onClick: () => setEditing({ type: 'feed', id: menu.id }) },
    ...(folders.length > 0 ? [{ label: menu.extra?.folderId ? 'Remove from folder' : 'Move to folder...', onClick: () => {
      if (menu.extra?.folderId) { updateFeedMut.mutate({ feedId: menu.id, data: { folderId: null } }); }
      else { const n = prompt('Move to folder:\n' + folders.map(f => f.name).join('\n')); const f = folders.find(f => f.name.toLowerCase() === n?.toLowerCase()); if (f) updateFeedMut.mutate({ feedId: menu.id, data: { folderId: f.id } }); }
    }}] : []),
    { label: 'Refresh now', onClick: () => refreshFeedMut.mutate(menu.id) },
    { label: 'Unsubscribe', onClick: () => { if (confirm(`Unsubscribe from "${menu.name}"?`)) unsubscribeMut.mutate(menu.id); }, danger: true },
  ] : [];
  const folderMenuItems = menu?.type === 'folder' ? [
    { label: 'Rename', onClick: () => setEditing({ type: 'folder', id: menu.id }) },
    { label: 'Delete folder', onClick: () => { if (confirm(`Delete "${menu.name}"?`)) deleteFolderMut.mutate(menu.id); }, danger: true },
  ] : [];
  const tagMenuItems = menu?.type === 'tag' ? [
    { label: 'Rename', onClick: () => setEditing({ type: 'tag', id: menu.id }) },
    { label: 'Delete tag', onClick: () => { if (confirm(`Delete "${menu.name}"?`)) deleteTagMut.mutate(menu.id); }, danger: true },
  ] : [];
  const savedSearchMenuItems = menu?.type === 'saved-search' ? [
    { label: menu.extra?.isMonitor ? 'Disable monitor' : 'Enable monitor', onClick: () => updateSavedSearchMut.mutate({ id: menu.id, data: { isMonitor: !menu.extra?.isMonitor } }) },
    { label: 'Delete saved search', onClick: () => { if (confirm(`Delete "${menu.name}"?`)) deleteSavedSearchMut.mutate(menu.id); }, danger: true },
  ] : [];
  const menuItems = [...feedMenuItems, ...folderMenuItems, ...tagMenuItems, ...savedSearchMenuItems];

  return (
    <aside className="w-64 border-r border-border bg-surface-secondary flex flex-col shrink-0 h-full overflow-hidden">
      <div className="p-3 border-b border-border">
        <input data-search-input type="text" placeholder="Search... (press /)" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={handleSearch}
          className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-primary-500" />
        {isSearching && (
          <div className="mt-1.5 flex items-center gap-2">
            <button onClick={() => { setSearchQuery(''); setIsSearching(false); }} className="text-xs text-primary-600 hover:underline">Clear search</button>
            <button
              onClick={handleSaveSearch}
              disabled={createSavedSearchMut.isPending}
              className="flex items-center gap-1 text-xs text-text-secondary hover:text-primary-600"
              title="Save this search"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
              {createSavedSearchMut.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {/* Smart Feeds */}
        <div className="space-y-0.5 mb-4">
          <button onClick={() => clearFilters()} className={`w-full flex items-center justify-between px-2.5 py-1.5 text-sm rounded ${!selectedFeedId && !selectedFolderId && !selectedTagId && !showStarred && !isSearching ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-text-secondary hover:bg-surface-tertiary'}`}>
            <span className="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>All Articles</span>
            <span className="text-xs">{feeds.reduce((s, f) => s + f.unreadCount, 0) || ''}</span>
          </button>
          <button onClick={() => setShowStarred(true)} className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-sm rounded ${showStarred ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-text-secondary hover:bg-surface-tertiary'}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={showStarred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>Starred
          </button>
        </div>

        {/* Saved Searches */}
        {savedSearches.length > 0 && (
          <div className="mb-4">
            <div className="px-2.5 mb-1"><span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Saved Searches</span></div>
            <div className="space-y-0.5">
              {savedSearches.map((ss) => (
                <button
                  key={ss.id}
                  onClick={() => handleExecuteSavedSearch(ss.query)}
                  onContextMenu={(e) => openMenu(e, 'saved-search', ss.id, ss.name, { isMonitor: ss.isMonitor })}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-sm rounded truncate ${isSearching && searchQuery === ss.query ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-text-secondary hover:bg-surface-tertiary'}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                  <span className="truncate flex-1 text-left">{ss.name}</span>
                  {ss.isMonitor && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-primary-500" title="Monitored">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Folders */}
        {folders.length > 0 && (
          <div className="mb-4">
            <div className="px-2.5 mb-1"><span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Folders</span></div>
            <div className="space-y-0.5">
              {folders.map((folder) => (
                <FolderItem key={folder.id} folder={folder} selectedFolderId={selectedFolderId} onSelect={selectFolder} feeds={feeds} selectedFeedId={selectedFeedId} onSelectFeed={selectFeed} onContextMenu={openMenu}
                  editing={editing} onSaveEdit={async (name) => { await foldersApi.update(editing!.id, { name }); qc.invalidateQueries({ queryKey: ['folders'] }); setEditing(null); }}
                  onCancelEdit={() => setEditing(null)} onSaveFeedEdit={(fid, name) => { updateFeedMut.mutate({ feedId: fid, data: { customTitle: name } }); setEditing(null); }}
                  onDropFeed={handleDrop} dragOverFolder={dragOverFolder} setDragOverFolder={setDragOverFolder} />
              ))}
            </div>
          </div>
        )}

        {/* Feeds (ungrouped) */}
        <div className="mb-4">
          <div className="flex items-center justify-between px-2.5 mb-1">
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Feeds</span>
            <div className="flex gap-1">
              <button onClick={() => setShowAddFolder(!showAddFolder)} className="text-text-tertiary hover:text-text-primary" title="New folder"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg></button>
              <button onClick={() => setShowAddFeed(!showAddFeed)} className="text-text-tertiary hover:text-text-primary" title="Add feed by URL"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg></button>
            </div>
          </div>

          {showAddFolder && (
            <form className="px-2 mb-2" onSubmit={(e) => { e.preventDefault(); if (!newFolderName.trim()) return; createFolderMut.mutate({ name: newFolderName.trim() }, { onSuccess: () => { setNewFolderName(''); setShowAddFolder(false); } }); }}>
              <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Folder name..." autoFocus className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-primary-500 mb-1.5" />
              <button type="submit" disabled={createFolderMut.isPending} className="w-full px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">{createFolderMut.isPending ? 'Creating...' : 'Create Folder'}</button>
            </form>
          )}

          {showAddFeed && (
            <form className="px-2 mb-2" onSubmit={(e) => { e.preventDefault(); if (!newUrl.trim()) return; subscribeMut.mutate({ url: newUrl.trim(), folderId: newFeedFolder ?? undefined }, { onSuccess: () => { setNewUrl(''); setNewFeedFolder(null); setShowAddFeed(false); } }); }}>
              <input type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="Feed URL..." autoFocus className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-primary-500 mb-1.5" />
              {folders.length > 0 && <FolderPicker folders={folders} value={newFeedFolder} onChange={setNewFeedFolder} className="w-full mb-1.5" />}
              <button type="submit" disabled={subscribeMut.isPending} className="w-full px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">{subscribeMut.isPending ? 'Adding...' : 'Add Feed'}</button>
              {subscribeMut.isError && <p className="text-xs text-red-500 mt-1">{subscribeMut.error?.message}</p>}
            </form>
          )}

          <div onDragOver={(e) => { e.preventDefault(); setDragOverFolder('__none__'); }} onDragLeave={() => setDragOverFolder(null)}
            onDrop={(e) => { e.preventDefault(); const fid = e.dataTransfer.getData('feedId'); if (fid) handleDrop(fid, null); }}
            className={`space-y-0.5 min-h-[24px] rounded transition-colors ${dragOverFolder === '__none__' ? 'bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-300' : ''}`}>
            {ungroupedFeeds.map((feed) => (
              <FeedButton key={feed.id} feed={feed} isSelected={selectedFeedId === feed.id} onClick={() => selectFeed(feed.id)}
                onContextMenu={(e) => openMenu(e, 'feed', feed.id, feed.customTitle ?? feed.title ?? feed.url, { folderId: feed.folderId })}
                isEditing={editing?.type === 'feed' && editing.id === feed.id} onSaveEdit={(name) => { updateFeedMut.mutate({ feedId: feed.id, data: { customTitle: name } }); setEditing(null); }} onCancelEdit={() => setEditing(null)} draggable />
            ))}
            {feeds.length === 0 && onOpenAddSources && <button onClick={onOpenAddSources} className="w-full px-2.5 py-3 text-xs text-primary-600 hover:underline text-center">Browse popular sources to get started</button>}
          </div>
        </div>

        {/* Tags */}
        <div className="mb-4">
          <div className="flex items-center justify-between px-2.5 mb-1">
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Tags</span>
            <button onClick={() => setShowAddTag(!showAddTag)} className="text-text-tertiary hover:text-text-primary" title="New tag"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg></button>
          </div>
          {showAddTag && (
            <form className="px-2 mb-2" onSubmit={(e) => { e.preventDefault(); if (!newTagName.trim()) return; createTagMut.mutate({ name: newTagName.trim() }, { onSuccess: () => { setNewTagName(''); setShowAddTag(false); } }); }}>
              <input type="text" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="Tag name..." autoFocus className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-primary-500 mb-1.5" />
              <button type="submit" className="w-full px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700">Create Tag</button>
            </form>
          )}
          <div className="flex flex-wrap gap-1.5 px-2.5">
            {tags.map((tag) => editing?.type === 'tag' && editing.id === tag.id ? (
              <InlineEdit key={tag.id} value={tag.name} onSave={async (name) => { await tagsApi.update(tag.id, { name }); qc.invalidateQueries({ queryKey: ['tags'] }); setEditing(null); }} onCancel={() => setEditing(null)} />
            ) : (
              <button key={tag.id} onClick={() => selectTag(tag.id)} onContextMenu={(e) => openMenu(e, 'tag', tag.id, tag.name)}
                className={`px-2 py-0.5 text-xs rounded-full transition-colors ${selectedTagId === tag.id ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300' : 'bg-surface-tertiary text-text-secondary hover:bg-surface'}`}
                style={tag.color ? { borderLeft: `3px solid ${tag.color}` } : undefined}>
                {tag.name}{tag.articleCount > 0 && <span className="ml-1 text-text-tertiary">{tag.articleCount}</span>}
              </button>
            ))}
            {tags.length === 0 && <p className="text-xs text-text-tertiary py-1">No tags yet</p>}
          </div>
        </div>
      </nav>

      {onOpenAddSources && (
        <div className="p-3 border-t border-border shrink-0">
          <button onClick={onOpenAddSources} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>Add Sources
          </button>
        </div>
      )}
      {menu && menuItems.length > 0 && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </aside>
  );
}

function FolderItem({ folder, selectedFolderId, onSelect, feeds, selectedFeedId, onSelectFeed, onContextMenu, editing, onSaveEdit, onCancelEdit, onSaveFeedEdit, onDropFeed, dragOverFolder, setDragOverFolder }: {
  folder: FolderWithCounts; selectedFolderId: string | null; onSelect: (id: string) => void;
  feeds: { id: string; folderId: string | null; customTitle: string | null; title: string | null; url: string; faviconUrl: string | null; unreadCount: number }[];
  selectedFeedId: string | null; onSelectFeed: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, type: 'feed' | 'folder' | 'tag', id: string, name: string, extra?: Record<string, unknown>) => void;
  editing: { type: string; id: string } | null; onSaveEdit: (name: string) => void; onCancelEdit: () => void; onSaveFeedEdit: (feedId: string, name: string) => void;
  onDropFeed: (feedId: string, folderId: string | null) => void; dragOverFolder: string | null; setDragOverFolder: (id: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const folderFeeds = feeds.filter((f) => f.folderId === folder.id);
  const isEditing = editing?.type === 'folder' && editing.id === folder.id;
  const isDragOver = dragOverFolder === folder.id;

  return (
    <div>
      <div className={`flex items-center rounded transition-colors ${isDragOver ? 'bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-300' : ''}`}
        onContextMenu={(e) => onContextMenu(e, 'folder', folder.id, folder.name)}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverFolder(folder.id); }}
        onDragLeave={(e) => { e.stopPropagation(); setDragOverFolder(null); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const fid = e.dataTransfer.getData('feedId'); if (fid) onDropFeed(fid, folder.id); }}>
        <button onClick={() => setExpanded(!expanded)} className="p-1 text-text-tertiary hover:text-text-primary">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${expanded ? 'rotate-90' : ''}`}><polyline points="9 18 15 12 9 6" /></svg>
        </button>
        {isEditing ? <div className="flex-1 px-1.5"><InlineEdit value={folder.name} onSave={onSaveEdit} onCancel={onCancelEdit} /></div> : (
          <button onClick={() => onSelect(folder.id)} className={`flex-1 flex items-center justify-between px-1.5 py-1.5 text-sm rounded truncate ${selectedFolderId === folder.id ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-text-secondary hover:bg-surface-tertiary'}`}>
            <span className="truncate">{folder.name}</span>{folder.unreadCount > 0 && <span className="text-xs text-text-tertiary">{folder.unreadCount}</span>}
          </button>
        )}
      </div>
      {expanded && <div className="ml-5 space-y-0.5 min-h-[4px]">
        {folderFeeds.map((feed) => <FeedButton key={feed.id} feed={feed} isSelected={selectedFeedId === feed.id} onClick={() => onSelectFeed(feed.id)}
          onContextMenu={(e) => onContextMenu(e, 'feed', feed.id, feed.customTitle ?? feed.title ?? feed.url, { folderId: feed.folderId })}
          isEditing={editing?.type === 'feed' && editing.id === feed.id} onSaveEdit={(name) => onSaveFeedEdit(feed.id, name)} onCancelEdit={onCancelEdit} draggable />)}
      </div>}
      {expanded && folder.children.map((child) => <div key={child.id} className="ml-3">
        <FolderItem folder={child} selectedFolderId={selectedFolderId} onSelect={onSelect} feeds={feeds} selectedFeedId={selectedFeedId} onSelectFeed={onSelectFeed} onContextMenu={onContextMenu} editing={editing} onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit} onSaveFeedEdit={onSaveFeedEdit} onDropFeed={onDropFeed} dragOverFolder={dragOverFolder} setDragOverFolder={setDragOverFolder} />
      </div>)}
    </div>
  );
}

function FeedButton({ feed, isSelected, onClick, onContextMenu, isEditing, onSaveEdit, onCancelEdit, draggable }: {
  feed: { id: string; customTitle: string | null; title: string | null; url: string; faviconUrl: string | null; unreadCount: number };
  isSelected: boolean; onClick: () => void; onContextMenu?: (e: React.MouseEvent) => void;
  isEditing?: boolean; onSaveEdit?: (name: string) => void; onCancelEdit?: () => void; draggable?: boolean;
}) {
  if (isEditing && onSaveEdit && onCancelEdit) return <div className="px-2.5 py-1"><InlineEdit value={feed.customTitle ?? feed.title ?? ''} onSave={onSaveEdit} onCancel={onCancelEdit} /></div>;
  return (
    <button onClick={onClick} onContextMenu={onContextMenu} draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.setData('feedId', feed.id); e.dataTransfer.effectAllowed = 'move'; }}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-sm rounded truncate ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${isSelected ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-text-secondary hover:bg-surface-tertiary'}`}>
      {feed.faviconUrl ? <img src={feed.faviconUrl} alt="" className="w-4 h-4 rounded" /> : <span className="w-4 h-4 rounded bg-primary-100 dark:bg-primary-800 flex items-center justify-center text-[10px] text-primary-600">{(feed.customTitle ?? feed.title ?? 'F')[0]}</span>}
      <span className="truncate flex-1 text-left">{feed.customTitle ?? feed.title ?? feed.url}</span>
      {feed.unreadCount > 0 && <span className="text-xs text-text-tertiary">{feed.unreadCount}</span>}
    </button>
  );
}
