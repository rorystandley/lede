import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { discoverApi, type DirectoryFeed, type DetectResult } from '../api/discover.api.js';
import { feedsApi } from '../api/index.js';
import { useFolders } from '../hooks/use-folders.js';
import { FolderPicker } from '../components/shared/FolderPicker.js';

interface Props {
  onClose: () => void;
}

export function AddSourcesPage({ onClose }: Props) {
  const qc = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [detected, setDetected] = useState<DetectResult | null>(null);
  const [activeTab, setActiveTab] = useState<'browse' | 'url'>('browse');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const { data: foldersData } = useFolders();
  const folders = foldersData ?? [];

  const { data: directory, isLoading } = useQuery({
    queryKey: ['feed-directory', selectedCategory, searchQuery],
    queryFn: () => discoverApi.directory({
      category: selectedCategory ?? undefined,
      q: searchQuery || undefined,
    }),
  });

  const subscribeMut = useMutation({
    mutationFn: ({ url, folderId }: { url: string; folderId?: string }) => feedsApi.subscribe(url, folderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feeds'] });
      qc.invalidateQueries({ queryKey: ['feed-directory'] });
    },
  });

  const detectMut = useMutation({
    mutationFn: (url: string) => discoverApi.detect(url),
    onSuccess: (data) => setDetected(data),
    onError: () => setDetected({ valid: false, url: customUrl, error: 'Could not reach or parse feed' }),
  });

  const categories = directory?.categories ?? [];
  const feeds = directory?.feeds ?? [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50">
      <div className="bg-surface rounded-t-xl md:rounded-lg border border-border shadow-xl w-full md:max-w-3xl md:mx-4 h-[80dvh] md:h-[80vh] md:max-h-[640px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold text-text-primary">Add Sources</h2>
          <button onClick={onClose} className="p-1 text-text-tertiary hover:text-text-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          <button
            onClick={() => setActiveTab('browse')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium ${activeTab === 'browse' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-text-secondary hover:text-text-primary'}`}
          >
            Browse Popular Sources
          </button>
          <button
            onClick={() => setActiveTab('url')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium ${activeTab === 'url' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-text-secondary hover:text-text-primary'}`}
          >
            Add by URL
          </button>
        </div>

        {/* Folder picker - shared across tabs */}
        {folders.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface-secondary">
            <span className="text-xs text-text-secondary whitespace-nowrap">Add to folder:</span>
            <FolderPicker folders={folders} value={selectedFolder} onChange={setSelectedFolder} className="flex-1 text-xs" />
          </div>
        )}

        <div className="flex-1 flex flex-col min-h-0">
          {activeTab === 'browse' ? (
            <>
              {/* Search + filters - pinned, do not scroll with results */}
              <div className="shrink-0 px-4 pt-4 pb-3 border-b border-border space-y-3">
                {/* Search */}
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search sources..."
                  className="w-full px-3 py-2 text-sm bg-surface-secondary border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-primary-500"
                />

                {/* Category pills */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                      !selectedCategory ? 'bg-primary-600 text-white' : 'bg-surface-tertiary text-text-secondary hover:bg-border'
                    }`}
                  >
                    All
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                      className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                        selectedCategory === cat ? 'bg-primary-600 text-white' : 'bg-surface-tertiary text-text-secondary hover:bg-border'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Feed grid - the only part that scrolls */}
              <div className="flex-1 overflow-y-auto min-h-0 p-4">
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {feeds.map((feed) => (
                      <FeedDirectoryCard
                        key={feed.url}
                        feed={feed}
                        subscribing={subscribeMut.isPending && subscribeMut.variables?.url === feed.url}
                        onSubscribe={() => subscribeMut.mutate({ url: feed.url, folderId: selectedFolder ?? undefined })}
                      />
                    ))}
                    {feeds.length === 0 && (
                      <p className="col-span-full text-sm text-text-tertiary text-center py-6">
                        {searchQuery ? 'No sources match your search' : 'No sources in this category'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0 p-4">
              <p className="text-sm text-text-secondary mb-4">
                Enter any RSS, Atom, or JSON feed URL. We'll detect and validate it before subscribing.
              </p>

              <div className="flex gap-2 mb-4">
                <input
                  type="url"
                  value={customUrl}
                  onChange={(e) => { setCustomUrl(e.target.value); setDetected(null); }}
                  placeholder="https://example.com/feed.xml"
                  className="flex-1 px-3 py-2 text-sm bg-surface-secondary border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-primary-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customUrl.trim()) detectMut.mutate(customUrl.trim());
                  }}
                />
                <button
                  onClick={() => customUrl.trim() && detectMut.mutate(customUrl.trim())}
                  disabled={detectMut.isPending || !customUrl.trim()}
                  className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {detectMut.isPending ? 'Checking...' : 'Detect Feed'}
                </button>
              </div>

              {/* Detection result */}
              {detected && (
                <div className={`rounded-lg border p-4 ${detected.valid ? 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20' : 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20'}`}>
                  {detected.valid ? (
                    <>
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-text-primary">{detected.title ?? 'Untitled Feed'}</h3>
                          {detected.description && (
                            <p className="text-xs text-text-secondary mt-1">{detected.description}</p>
                          )}
                          <p className="text-xs text-text-tertiary mt-1">{detected.itemCount} articles found</p>
                        </div>
                        <button
                          onClick={() => subscribeMut.mutate({ url: detected.url, folderId: selectedFolder ?? undefined })}
                          disabled={subscribeMut.isPending}
                          className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 shrink-0 ml-3"
                        >
                          {subscribeMut.isPending ? 'Adding...' : 'Subscribe'}
                        </button>
                      </div>
                      {subscribeMut.isSuccess && (
                        <p className="text-xs text-green-600 mt-2">Subscribed successfully!</p>
                      )}
                    </>
                  ) : (
                    <div>
                      <p className="text-sm text-red-600 dark:text-red-400 font-medium">Feed not found</p>
                      <p className="text-xs text-text-secondary mt-1">{detected.error}</p>
                      <p className="text-xs text-text-tertiary mt-2">
                        Tips: Make sure the URL points directly to an RSS/Atom/JSON feed, not a regular webpage.
                        Many sites have feeds at <code className="bg-surface-tertiary px-1 rounded">/feed</code>, <code className="bg-surface-tertiary px-1 rounded">/rss</code>, or <code className="bg-surface-tertiary px-1 rounded">/atom.xml</code>.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Common patterns help */}
              <div className="mt-6">
                <h4 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">Common feed URL patterns</h4>
                <div className="space-y-1.5 text-xs text-text-secondary">
                  <p><code className="bg-surface-tertiary px-1.5 py-0.5 rounded font-mono">https://example.com/feed</code> — WordPress sites</p>
                  <p><code className="bg-surface-tertiary px-1.5 py-0.5 rounded font-mono">https://example.com/rss</code> — Many blogs</p>
                  <p><code className="bg-surface-tertiary px-1.5 py-0.5 rounded font-mono">https://example.com/atom.xml</code> — Atom feeds</p>
                  <p><code className="bg-surface-tertiary px-1.5 py-0.5 rounded font-mono">https://www.youtube.com/feeds/videos.xml?channel_id=...</code> — YouTube channels</p>
                  <p><code className="bg-surface-tertiary px-1.5 py-0.5 rounded font-mono">https://www.reddit.com/r/subreddit/.rss</code> — Reddit subreddits</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FeedDirectoryCard({ feed, subscribing, onSubscribe }: {
  feed: DirectoryFeed;
  subscribing: boolean;
  onSubscribe: () => void;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-surface-secondary transition-colors">
      <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 text-sm font-bold shrink-0">
        {feed.name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-text-primary truncate">{feed.name}</h3>
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-surface-tertiary text-text-tertiary shrink-0">{feed.category}</span>
        </div>
        <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{feed.description}</p>
      </div>
      <button
        onClick={onSubscribe}
        disabled={feed.isSubscribed || subscribing}
        className={`px-3 py-1.5 text-xs font-medium rounded shrink-0 ${
          feed.isSubscribed
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 cursor-default'
            : 'bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50'
        }`}
      >
        {feed.isSubscribed ? 'Added' : subscribing ? '...' : 'Add'}
      </button>
    </div>
  );
}
