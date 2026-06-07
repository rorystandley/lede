import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

const authState = {
  accessToken: 'store-token',
};

vi.mock('./client.js', () => ({ api }));
vi.mock('../stores/auth.store.js', () => ({
  useAuthStore: {
    getState: () => authState,
  },
}));

describe('api modules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('wires article, auth, folder, tag, rule, digest, ai, sharing, annotation, search, saved search, stats, and user endpoints', async () => {
    const { aiApi } = await import('./ai.api.js');
    const { annotationsApi } = await import('./annotations.api.js');
    const { articlesApi } = await import('./articles.api.js');
    const { authApi } = await import('./auth.api.js');
    const { digestsApi } = await import('./digests.api.js');
    const { foldersApi } = await import('./folders.api.js');
    const { rulesApi } = await import('./rules.api.js');
    const { savedSearchesApi } = await import('./saved-searches.api.js');
    const { searchApi } = await import('./search.api.js');
    const { sharingApi } = await import('./sharing.api.js');
    const { statsApi } = await import('./stats.api.js');
    const { tagsApi } = await import('./tags.api.js');
    const { userApi } = await import('./user.api.js');

    articlesApi.list();
    articlesApi.list({ page: 2, pageSize: 20, feedId: 'feed-1' });
    articlesApi.search({ q: 'vite', tagId: 'tag-1' });
    articlesApi.getById('article-1');
    articlesApi.markRead(['article-1']);
    articlesApi.markAllRead({ folderId: 'folder-1' });
    articlesApi.markUnread(['article-2']);
    articlesApi.star('article-1', true);
    articlesApi.archive('article-2', false);
    articlesApi.extract('article-3');

    authApi.register('user@example.com', 'secret', 'User');
    authApi.login('user@example.com', 'secret');

    foldersApi.list();
    foldersApi.create('Tech', null);
    foldersApi.update('folder-1', { name: 'News', parentId: null, sortOrder: 2 });
    foldersApi.delete('folder-1');

    tagsApi.list();
    tagsApi.create('AI', '#fff');
    tagsApi.update('tag-1', { name: 'ML', color: null });
    tagsApi.delete('tag-2');
    tagsApi.setArticleTags('article-4', ['tag-1']);
    tagsApi.applyByName('article-4', ['news'], 'ai');

    rulesApi.list();
    rulesApi.create({ name: 'Rule', conditions: [], actions: [] });
    rulesApi.update('rule-1', { name: 'Updated' });
    rulesApi.delete('rule-2');

    digestsApi.latest();
    digestsApi.build();
    digestsApi.list();
    digestsApi.markDelivered('digest-1');

    aiApi.summarize('article-1');
    aiApi.suggestTags('article-2');
    aiApi.getConfig();
    aiApi.getUsage();
    aiApi.updateConfig('openai', 'key');

    annotationsApi.listForArticle('article-1');
    annotationsApi.create({ articleId: 'article-1', type: 'note', content: 'hello' });
    annotationsApi.update('annotation-1', { content: 'updated', color: '#000' });
    annotationsApi.delete('annotation-2');

    searchApi.search({ q: 'rss', page: 2, folderId: 'folder-1' });
    searchApi.search({} as any);
    sharingApi.getShareData('article-5');
    savedSearchesApi.list();
    savedSearchesApi.create({ name: 'Unread', query: 'is:unread' });
    savedSearchesApi.update('saved-1', { name: 'Pinned' });
    savedSearchesApi.delete('saved-2');
    statsApi.summary();
    statsApi.daily();
    statsApi.daily(30);
    statsApi.track('article-6', 1500);
    userApi.getProfile();
    userApi.updateProfile({ displayName: 'Reader' });

    expect(api.get).toHaveBeenCalledWith('/articles');
    expect(api.get).toHaveBeenCalledWith('/articles?page=2&pageSize=20&feedId=feed-1');
    expect(api.get).toHaveBeenCalledWith('/articles/search?q=vite&tagId=tag-1');
    expect(api.get).toHaveBeenCalledWith('/articles/article-1');
    expect(api.post).toHaveBeenCalledWith('/articles/mark-read', { articleIds: ['article-1'] });
    expect(api.post).toHaveBeenCalledWith('/articles/mark-all-read', { folderId: 'folder-1' });
    expect(api.post).toHaveBeenCalledWith('/articles/mark-unread', { articleIds: ['article-2'] });
    expect(api.patch).toHaveBeenCalledWith('/articles/article-1/star', { isStarred: true });
    expect(api.patch).toHaveBeenCalledWith('/articles/article-2/archive', { isArchived: false });
    expect(api.post).toHaveBeenCalledWith('/articles/article-3/extract');
    expect(api.post).toHaveBeenCalledWith('/auth/register', {
      email: 'user@example.com',
      password: 'secret',
      displayName: 'User',
    });
    expect(api.post).toHaveBeenCalledWith('/auth/login', {
      email: 'user@example.com',
      password: 'secret',
    });
    expect(api.get).toHaveBeenCalledWith('/folders');
    expect(api.post).toHaveBeenCalledWith('/folders', { name: 'Tech', parentId: null });
    expect(api.patch).toHaveBeenCalledWith('/folders/folder-1', {
      name: 'News',
      parentId: null,
      sortOrder: 2,
    });
    expect(api.delete).toHaveBeenCalledWith('/folders/folder-1');
    expect(api.get).toHaveBeenCalledWith('/tags');
    expect(api.post).toHaveBeenCalledWith('/tags', { name: 'AI', color: '#fff' });
    expect(api.patch).toHaveBeenCalledWith('/tags/tag-1', { name: 'ML', color: null });
    expect(api.delete).toHaveBeenCalledWith('/tags/tag-2');
    expect(api.put).toHaveBeenCalledWith('/tags/articles/article-4', { tagIds: ['tag-1'] });
    expect(api.post).toHaveBeenCalledWith('/tags/articles/article-4/by-name', {
      names: ['news'],
      source: 'ai',
    });
    expect(api.get).toHaveBeenCalledWith('/rules');
    expect(api.post).toHaveBeenCalledWith('/rules', { name: 'Rule', conditions: [], actions: [] });
    expect(api.patch).toHaveBeenCalledWith('/rules/rule-1', { name: 'Updated' });
    expect(api.delete).toHaveBeenCalledWith('/rules/rule-2');
    expect(api.get).toHaveBeenCalledWith('/digests/latest');
    expect(api.post).toHaveBeenCalledWith('/digests/build');
    expect(api.get).toHaveBeenCalledWith('/digests');
    expect(api.patch).toHaveBeenCalledWith('/digests/digest-1/delivered');
    expect(api.post).toHaveBeenCalledWith('/ai/summarize/article-1');
    expect(api.post).toHaveBeenCalledWith('/ai/suggest-tags/article-2');
    expect(api.get).toHaveBeenCalledWith('/ai/config');
    expect(api.get).toHaveBeenCalledWith('/ai/usage');
    expect(api.put).toHaveBeenCalledWith('/ai/config', { provider: 'openai', apiKey: 'key' });
    expect(api.get).toHaveBeenCalledWith('/annotations/articles/article-1');
    expect(api.post).toHaveBeenCalledWith('/annotations', {
      articleId: 'article-1',
      type: 'note',
      content: 'hello',
    });
    expect(api.patch).toHaveBeenCalledWith('/annotations/annotation-1', {
      content: 'updated',
      color: '#000',
    });
    expect(api.delete).toHaveBeenCalledWith('/annotations/annotation-2');
    expect(api.get).toHaveBeenCalledWith('/search?q=rss&page=2&folderId=folder-1');
    expect(api.get).toHaveBeenCalledWith('/search');
    expect(api.get).toHaveBeenCalledWith('/share/article/article-5');
    expect(api.get).toHaveBeenCalledWith('/search/saved');
    expect(api.post).toHaveBeenCalledWith('/search/saved', { name: 'Unread', query: 'is:unread' });
    expect(api.put).toHaveBeenCalledWith('/search/saved/saved-1', { name: 'Pinned' });
    expect(api.delete).toHaveBeenCalledWith('/search/saved/saved-2');
    expect(api.get).toHaveBeenCalledWith('/stats/summary');
    expect(api.get).toHaveBeenCalledWith('/stats/daily');
    expect(api.get).toHaveBeenCalledWith('/stats/daily?days=30');
    expect(api.post).toHaveBeenCalledWith('/stats/track', {
      articleId: 'article-6',
      readingTimeMs: 1500,
    });
    expect(api.get).toHaveBeenCalledWith('/user/profile');
    expect(api.patch).toHaveBeenCalledWith('/user/profile', { displayName: 'Reader' });
  });

  it('builds query strings for discover and feeds endpoints', async () => {
    const { discoverApi } = await import('./discover.api.js');
    const { feedsApi } = await import('./feeds.api.js');

    discoverApi.directory();
    discoverApi.directory({ category: 'tech', q: 'ai' });
    discoverApi.detect('https://example.com');
    feedsApi.list();
    feedsApi.list({ folderId: 'folder-1', page: 3, pageSize: 50 });
    feedsApi.subscribe('https://example.com/rss', 'folder-1', 'Example');
    feedsApi.update('feed-1', { folderId: null, customTitle: 'New title', refreshInterval: 30 });
    feedsApi.unsubscribe('feed-1');
    feedsApi.refresh('feed-2');
    feedsApi.refreshAll();

    expect(api.get).toHaveBeenCalledWith('/discover/directory/subscribed');
    expect(api.get).toHaveBeenCalledWith('/discover/directory/subscribed?category=tech&q=ai');
    expect(api.post).toHaveBeenCalledWith('/discover/detect', { url: 'https://example.com' });
    expect(api.get).toHaveBeenCalledWith('/feeds');
    expect(api.get).toHaveBeenCalledWith('/feeds?folderId=folder-1&page=3&pageSize=50');
    expect(api.post).toHaveBeenCalledWith('/feeds', {
      url: 'https://example.com/rss',
      folderId: 'folder-1',
      customTitle: 'Example',
    });
    expect(api.patch).toHaveBeenCalledWith('/feeds/feed-1', {
      folderId: null,
      customTitle: 'New title',
      refreshInterval: 30,
    });
    expect(api.delete).toHaveBeenCalledWith('/feeds/feed-1');
    expect(api.post).toHaveBeenCalledWith('/feeds/feed-2/refresh');
    expect(api.post).toHaveBeenCalledWith('/feeds/refresh-all');
  });

  it('handles opml and push flows that bypass the shared client', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValue('<opml/>'),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
      } as Response);

    const { opmlApi } = await import('./opml.api.js');
    const { deliveryApi, pushApi } = await import('./push.api.js');

    opmlApi.importOpml('<opml/>');
    const exported = await opmlApi.exportOpml();
    pushApi.vapidKey();
    pushApi.subscribe({
      endpoint: 'https://push.example',
      keys: { p256dh: 'key', auth: 'auth' },
      userAgent: 'vitest',
    });
    await pushApi.unsubscribe('https://push.example');
    pushApi.test();
    deliveryApi.capabilities();

    expect(exported).toBe('<opml/>');
    expect(api.post).toHaveBeenCalledWith('/opml/import', { opml: '<opml/>' });
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/opml/export', {
      headers: { Authorization: 'Bearer store-token' },
    });
    expect(api.get).toHaveBeenCalledWith('/push/vapid-key');
    expect(api.post).toHaveBeenCalledWith('/push/subscribe', {
      endpoint: 'https://push.example',
      keys: { p256dh: 'key', auth: 'auth' },
      userAgent: 'vitest',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/push/subscribe', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer store-token',
      },
      body: JSON.stringify({ endpoint: 'https://push.example' }),
    });
    expect(api.post).toHaveBeenCalledWith('/push/test');
    expect(api.get).toHaveBeenCalledWith('/delivery/capabilities');

    await expect(opmlApi.exportOpml()).rejects.toThrow('Export failed');
  });

  it('re-exports the API modules from the barrel file', async () => {
    const index = await import('./index.js');
    const { aiApi } = await import('./ai.api.js');
    const { annotationsApi } = await import('./annotations.api.js');
    const { articlesApi } = await import('./articles.api.js');
    const { authApi } = await import('./auth.api.js');
    const { digestsApi } = await import('./digests.api.js');
    const { feedsApi } = await import('./feeds.api.js');
    const { foldersApi } = await import('./folders.api.js');
    const { opmlApi } = await import('./opml.api.js');
    const { rulesApi } = await import('./rules.api.js');
    const { savedSearchesApi } = await import('./saved-searches.api.js');
    const { searchApi } = await import('./search.api.js');
    const { sharingApi } = await import('./sharing.api.js');
    const { tagsApi } = await import('./tags.api.js');

    expect(index.aiApi).toBe(aiApi);
    expect(index.annotationsApi).toBe(annotationsApi);
    expect(index.articlesApi).toBe(articlesApi);
    expect(index.authApi).toBe(authApi);
    expect(index.digestsApi).toBe(digestsApi);
    expect(index.feedsApi).toBe(feedsApi);
    expect(index.foldersApi).toBe(foldersApi);
    expect(index.opmlApi).toBe(opmlApi);
    expect(index.rulesApi).toBe(rulesApi);
    expect(index.savedSearchesApi).toBe(savedSearchesApi);
    expect(index.searchApi).toBe(searchApi);
    expect(index.sharingApi).toBe(sharingApi);
    expect(index.tagsApi).toBe(tagsApi);
  });
});
