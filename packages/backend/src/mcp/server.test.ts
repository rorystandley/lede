import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  connectMock,
  handleRequestMock,
  loggerInfoMock,
  serverInstances,
  transportInstances,
  feedServiceMock,
  articleServiceMock,
  digestServiceMock,
  aiServiceMock,
  folderServiceMock,
  tagServiceMock,
} = vi.hoisted(() => {
  const connectMock = vi.fn();
  const handleRequestMock = vi.fn().mockResolvedValue(undefined);
  const loggerInfoMock = vi.fn();
  const serverInstances: FakeMcpServer[] = [];
  const transportInstances: FakeTransport[] = [];

  class FakeMcpServer {
    tools = new Map<string, (params: unknown, extra: unknown) => Promise<unknown>>();
    prompts = new Map<string, (params: unknown, extra: unknown) => Promise<unknown>>();

    constructor(public meta: { name: string; version: string }) {
      serverInstances.push(this);
    }

    tool(
      name: string,
      _description: string,
      _schema: unknown,
      handler: (params: unknown, extra: unknown) => Promise<unknown>,
    ) {
      this.tools.set(name, handler);
    }

    prompt(
      name: string,
      _description: string,
      _schema: unknown,
      handler: (params: unknown, extra: unknown) => Promise<unknown>,
    ) {
      this.prompts.set(name, handler);
    }

    connect = connectMock;
  }

  class FakeTransport {
    sessionIdGenerator: () => string;

    constructor({ sessionIdGenerator }: { sessionIdGenerator: () => string }) {
      this.sessionIdGenerator = sessionIdGenerator;
      transportInstances.push(this);
    }

    handleRequest = handleRequestMock;
  }

  const feedServiceMock = {
    listForUser: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    refreshFeed: vi.fn(),
  };
  const articleServiceMock = {
    list: vi.fn(),
    getById: vi.fn(),
    search: vi.fn(),
    markRead: vi.fn(),
    setStar: vi.fn(),
  };
  const digestServiceMock = {
    getLatest: vi.fn(),
    buildDigest: vi.fn(),
  };
  const aiServiceMock = {
    summarize: vi.fn(),
    suggestTags: vi.fn(),
  };
  const folderServiceMock = {
    listForUser: vi.fn(),
    create: vi.fn(),
  };
  const tagServiceMock = {
    listForUser: vi.fn(),
    create: vi.fn(),
  };

  return {
    connectMock,
    handleRequestMock,
    loggerInfoMock,
    serverInstances,
    transportInstances,
    feedServiceMock,
    articleServiceMock,
    digestServiceMock,
    aiServiceMock,
    folderServiceMock,
    tagServiceMock,
  };
});

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class FakeMcpServer {
    tools = new Map<string, (params: unknown, extra: unknown) => Promise<unknown>>();
    prompts = new Map<string, (params: unknown, extra: unknown) => Promise<unknown>>();
    meta: { name: string; version: string };

    constructor(meta: { name: string; version: string }) {
      this.meta = meta;
      serverInstances.push(this as never);
    }

    tool(
      name: string,
      _description: string,
      _schema: unknown,
      handler: (params: unknown, extra: unknown) => Promise<unknown>,
    ) {
      this.tools.set(name, handler);
    }

    prompt(
      name: string,
      _description: string,
      _schema: unknown,
      handler: (params: unknown, extra: unknown) => Promise<unknown>,
    ) {
      this.prompts.set(name, handler);
    }

    connect = connectMock;
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class FakeTransport {
    sessionIdGenerator: () => string;

    constructor({ sessionIdGenerator }: { sessionIdGenerator: () => string }) {
      this.sessionIdGenerator = sessionIdGenerator;
      transportInstances.push(this as never);
    }

    handleRequest = handleRequestMock;
  },
}));

vi.mock('../services/feed.service.js', () => ({
  feedService: feedServiceMock,
}));

vi.mock('../services/article.service.js', () => ({
  articleService: articleServiceMock,
}));

vi.mock('../services/digest.service.js', () => ({
  digestService: digestServiceMock,
}));

vi.mock('../services/ai.service.js', () => ({
  aiService: aiServiceMock,
}));

vi.mock('../services/folder.service.js', () => ({
  folderService: folderServiceMock,
}));

vi.mock('../services/tag.service.js', () => ({
  tagService: tagServiceMock,
}));

vi.mock('../services/rule.service.js', () => ({
  ruleService: {},
}));

vi.mock('../lib/logger.js', () => ({
  getLogger: vi.fn(() => ({ info: loggerInfoMock })),
}));

import { createMcpServer, registerMcpRoutes } from './server.js';

describe('mcp server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverInstances.length = 0;
    transportInstances.length = 0;
  });

  it('registers MCP tools and prompts and routes requests through service wrappers', async () => {
    feedServiceMock.listForUser.mockResolvedValue({ items: [{ id: 'feed-1' }] });
    feedServiceMock.subscribe.mockResolvedValue({ feed: { id: 'feed-2', title: null } });
    feedServiceMock.unsubscribe.mockResolvedValue(undefined);
    feedServiceMock.refreshFeed.mockResolvedValue({ newArticles: 2 });
    articleServiceMock.list.mockResolvedValue({
      items: [
        {
          id: 'article-1',
          title: 'Title',
          feedTitle: 'Feed',
          publishedAt: '2026-06-06T00:00:00.000Z',
          isRead: false,
          isStarred: true,
        },
      ],
    });
    articleServiceMock.getById
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'article-1',
        title: 'Story',
        author: 'Author',
        url: 'https://example.com/story',
        feedTitle: 'Feed',
        publishedAt: '2026-06-06T00:00:00.000Z',
        contentText: 'x'.repeat(3200),
        isRead: false,
        isStarred: false,
        tags: [{ id: 'tag-1', name: 'AI', color: '#fff' }],
      });
    articleServiceMock.search.mockResolvedValue({
      items: [
        { id: 'article-1', title: 'Search hit', feedTitle: 'Feed', publishedAt: '2026-06-06T00:00:00.000Z' },
      ],
    });
    articleServiceMock.markRead.mockResolvedValue(undefined);
    articleServiceMock.setStar.mockResolvedValue(undefined);
    digestServiceMock.getLatest
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ content: { date: '2026-06-06' } });
    digestServiceMock.buildDigest.mockResolvedValue({ articleCount: 4, id: 'digest-1' });
    aiServiceMock.summarize
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('Short summary');
    aiServiceMock.suggestTags
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['ai', 'news']);
    folderServiceMock.listForUser.mockResolvedValue([{ id: 'folder-1' }]);
    folderServiceMock.create.mockResolvedValue({ id: 'folder-2' });
    tagServiceMock.listForUser.mockResolvedValue([{ id: 'tag-1', name: 'AI' }]);
    tagServiceMock.create.mockResolvedValue({ id: 'tag-2' });

    createMcpServer();
    const extra = { userId: 'user-1' };

    expect(serverInstances[0]?.meta).toEqual({ name: 'lede', version: '0.1.0' });

    const tools = serverInstances[0]?.tools;
    const prompts = serverInstances[0]?.prompts;
    expect([...tools?.keys() ?? []]).toEqual([
      'feeds/list',
      'feeds/subscribe',
      'feeds/unsubscribe',
      'feeds/refresh',
      'articles/list',
      'articles/get',
      'articles/search',
      'articles/mark-read',
      'articles/star',
      'digest/latest',
      'digest/build',
      'ai/summarize',
      'ai/suggest-tags',
      'folders/list',
      'folders/create',
      'tags/list',
      'tags/create',
    ]);
    expect(prompts?.size).toBe(2);

    await expect(tools?.get('feeds/list')?.({ folderId: 'folder-1' }, extra)).resolves.toEqual({
      content: [{ type: 'text', text: JSON.stringify([{ id: 'feed-1' }], null, 2) }],
    });
    await expect(tools?.get('feeds/subscribe')?.({ url: 'https://feeds.example.com', folderId: 'folder-1' }, extra)).resolves.toEqual({
      content: [{ type: 'text', text: 'Subscribed to "https://feeds.example.com" with feed-2' }],
    });
    await expect(tools?.get('feeds/unsubscribe')?.({ feedId: 'feed-1' }, extra)).resolves.toEqual({
      content: [{ type: 'text', text: 'Unsubscribed successfully' }],
    });
    await expect(tools?.get('feeds/refresh')?.({ feedId: 'feed-1' }, extra)).resolves.toEqual({
      content: [{ type: 'text', text: 'Refreshed: 2 new articles' }],
    });
    await expect(tools?.get('articles/list')?.({}, extra)).resolves.toEqual({
      content: [{
        type: 'text',
        text: JSON.stringify([{
          id: 'article-1',
          title: 'Title',
          feedTitle: 'Feed',
          publishedAt: '2026-06-06T00:00:00.000Z',
          isRead: false,
          isStarred: true,
        }], null, 2),
      }],
    });
    await expect(tools?.get('articles/get')?.({ articleId: 'article-1' }, extra)).resolves.toEqual({
      content: [{ type: 'text', text: 'Article not found' }],
    });
    await expect(tools?.get('articles/get')?.({ articleId: 'article-1' }, extra)).resolves.toEqual({
      content: [{
        type: 'text',
        text: JSON.stringify({
          id: 'article-1',
          title: 'Story',
          author: 'Author',
          url: 'https://example.com/story',
          feedTitle: 'Feed',
          publishedAt: '2026-06-06T00:00:00.000Z',
          content: 'x'.repeat(3000),
          isRead: false,
          isStarred: false,
          tags: [{ id: 'tag-1', name: 'AI', color: '#fff' }],
        }, null, 2),
      }],
    });
    await expect(tools?.get('articles/search')?.({ q: 'ai' }, extra)).resolves.toEqual({
      content: [{
        type: 'text',
        text: JSON.stringify([{
          id: 'article-1',
          title: 'Search hit',
          feedTitle: 'Feed',
          publishedAt: '2026-06-06T00:00:00.000Z',
        }], null, 2),
      }],
    });
    await expect(tools?.get('articles/mark-read')?.({ articleIds: ['article-1', 'article-2'] }, extra)).resolves.toEqual({
      content: [{ type: 'text', text: 'Marked 2 articles as read' }],
    });
    await expect(tools?.get('articles/star')?.({ articleId: 'article-1', isStarred: true }, extra)).resolves.toEqual({
      content: [{ type: 'text', text: 'Article starred' }],
    });
    await expect(tools?.get('articles/star')?.({ articleId: 'article-1', isStarred: false }, extra)).resolves.toEqual({
      content: [{ type: 'text', text: 'Article unstarred' }],
    });
    await expect(tools?.get('digest/latest')?.({}, extra)).resolves.toEqual({
      content: [{ type: 'text', text: 'No digest available. Use digest/build to create one.' }],
    });
    await expect(tools?.get('digest/latest')?.({}, extra)).resolves.toEqual({
      content: [{ type: 'text', text: JSON.stringify({ date: '2026-06-06' }, null, 2) }],
    });
    await expect(tools?.get('digest/build')?.({}, extra)).resolves.toEqual({
      content: [{ type: 'text', text: 'Digest built: 4 articles, ID: digest-1' }],
    });
    await expect(tools?.get('ai/summarize')?.({ articleId: 'article-1' }, extra)).resolves.toEqual({
      content: [{ type: 'text', text: 'AI not configured or summarization failed. Configure AI in settings.' }],
    });
    await expect(tools?.get('ai/summarize')?.({ articleId: 'article-1' }, extra)).resolves.toEqual({
      content: [{ type: 'text', text: 'Short summary' }],
    });
    await expect(tools?.get('ai/suggest-tags')?.({ articleId: 'article-1' }, extra)).resolves.toEqual({
      content: [{ type: 'text', text: 'AI not configured for this user. Set provider and API key in Settings first.' }],
    });
    await expect(tools?.get('ai/suggest-tags')?.({ articleId: 'article-1' }, extra)).resolves.toEqual({
      content: [{ type: 'text', text: 'No suggestions for this article.' }],
    });
    await expect(tools?.get('ai/suggest-tags')?.({ articleId: 'article-1' }, extra)).resolves.toEqual({
      content: [{ type: 'text', text: 'Suggested tags: ai, news' }],
    });
    await expect(tools?.get('folders/list')?.({}, extra)).resolves.toEqual({
      content: [{ type: 'text', text: JSON.stringify([{ id: 'folder-1' }], null, 2) }],
    });
    await expect(tools?.get('folders/create')?.({ name: 'Inbox', parentId: 'folder-1' }, extra)).resolves.toEqual({
      content: [{ type: 'text', text: 'Folder "Inbox" created with ID: folder-2' }],
    });
    await expect(tools?.get('tags/list')?.({}, extra)).resolves.toEqual({
      content: [{ type: 'text', text: JSON.stringify([{ id: 'tag-1', name: 'AI' }], null, 2) }],
    });
    await expect(tools?.get('tags/create')?.({ name: 'AI', color: '#fff' }, extra)).resolves.toEqual({
      content: [{ type: 'text', text: 'Tag "AI" created with ID: tag-2' }],
    });

    await expect(prompts?.get('morning-briefing')?.({}, extra)).resolves.toEqual({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: 'Please use the digest/latest tool to get my morning briefing, then summarize the key themes and recommend which articles I should read first.',
        },
      }],
    });
    await expect(prompts?.get('research-topic')?.({ topic: 'AI' }, extra)).resolves.toEqual({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: 'Search my feeds for articles about "AI" using the articles/search tool, then summarize the findings and key takeaways.',
        },
      }],
    });
  });

  it('requires a user context when invoking MCP tool handlers', async () => {
    createMcpServer();

    await expect(serverInstances[0]?.tools.get('feeds/list')?.({}, {})).rejects.toThrow(
      'User context not available. Authenticate via API key in the MCP session.',
    );
  });

  it('registers the MCP route and handles unauthorized, invalid, and successful requests', async () => {
    const routes = new Map<string, (req: any, reply: any) => Promise<unknown>>();
    const app = {
      post: vi.fn((path: string, handler: (req: any, reply: any) => Promise<unknown>) => {
        routes.set(path, handler);
      }),
      authenticate: vi.fn(),
    };

    await registerMcpRoutes(app as never);
    expect(loggerInfoMock).toHaveBeenCalledWith('MCP server registered at /mcp');

    const handler = routes.get('/mcp');
    expect(handler).toBeDefined();

    const unauthorizedReply = {
      status: vi.fn(function (this: any) { return this; }),
      send: vi.fn(),
      raw: {},
    };
    await handler?.({ headers: {}, raw: {}, body: {} }, unauthorizedReply);
    expect(unauthorizedReply.status).toHaveBeenCalledWith(401);
    expect(unauthorizedReply.send).toHaveBeenCalledWith({ error: 'Authorization required' });

    const invalidReply = {
      status: vi.fn(function (this: any) { return this; }),
      send: vi.fn(),
      raw: {},
    };
    app.authenticate.mockRejectedValueOnce(new Error('bad key'));
    await handler?.({
      headers: { authorization: 'Bearer token' },
      raw: {},
      body: {},
    }, invalidReply);
    expect(invalidReply.status).toHaveBeenCalledWith(401);
    expect(invalidReply.send).toHaveBeenCalledWith({ error: 'Invalid credentials' });

    app.authenticate.mockResolvedValueOnce(undefined);
    const reply = { raw: {} };
    const req = {
      headers: { authorization: 'Bearer good' },
      raw: {},
      body: { jsonrpc: '2.0' },
      user: { id: 'user-1' },
    };

    await handler?.(req, reply);

    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(transportInstances[0]?.sessionIdGenerator()).toBe('user-1');
    expect(handleRequestMock).toHaveBeenCalledWith(req.raw, reply.raw, { jsonrpc: '2.0' });
  });
});
