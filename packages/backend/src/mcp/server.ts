import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { feedService } from '../services/feed.service.js';
import { articleService } from '../services/article.service.js';
import { digestService } from '../services/digest.service.js';
import { aiService } from '../services/ai.service.js';
import { folderService } from '../services/folder.service.js';
import { tagService } from '../services/tag.service.js';
import { ruleService } from '../services/rule.service.js';
import { getLogger } from '../lib/logger.js';
import type { FastifyInstance } from 'fastify';

export function createMcpServer() {
  const server = new McpServer({
    name: 'news-reader',
    version: '0.1.0',
  });

  // === TOOLS ===

  server.tool('feeds/list', 'List all subscribed feeds with unread counts', {
    folderId: z.string().uuid().optional().describe('Filter by folder ID'),
  }, async ({ folderId }, extra) => {
    const userId = getUserIdFromContext(extra);
    const result = await feedService.listForUser(userId, { folderId });
    return { content: [{ type: 'text', text: JSON.stringify(result.items, null, 2) }] };
  });

  server.tool('feeds/subscribe', 'Subscribe to a new RSS feed', {
    url: z.string().url().describe('Feed URL to subscribe to'),
    folderId: z.string().uuid().optional().describe('Folder to put the feed in'),
  }, async ({ url, folderId }, extra) => {
    const userId = getUserIdFromContext(extra);
    const result = await feedService.subscribe(userId, url, folderId);
    return { content: [{ type: 'text', text: `Subscribed to "${result.feed.title ?? url}" with ${result.feed.id}` }] };
  });

  server.tool('feeds/unsubscribe', 'Unsubscribe from a feed', {
    feedId: z.string().uuid().describe('Feed ID to unsubscribe from'),
  }, async ({ feedId }, extra) => {
    const userId = getUserIdFromContext(extra);
    await feedService.unsubscribe(userId, feedId);
    return { content: [{ type: 'text', text: 'Unsubscribed successfully' }] };
  });

  server.tool('feeds/refresh', 'Trigger immediate refresh of a feed', {
    feedId: z.string().uuid().describe('Feed ID to refresh'),
  }, async ({ feedId }) => {
    const result = await feedService.refreshFeed(feedId);
    return { content: [{ type: 'text', text: `Refreshed: ${result.newArticles} new articles` }] };
  });

  server.tool('articles/list', 'List articles with filters', {
    feedId: z.string().uuid().optional().describe('Filter by feed'),
    folderId: z.string().uuid().optional().describe('Filter by folder'),
    isRead: z.boolean().optional().describe('Filter by read state'),
    isStarred: z.boolean().optional().describe('Filter starred only'),
    page: z.number().int().min(1).optional().describe('Page number'),
    pageSize: z.number().int().min(1).max(50).optional().describe('Items per page'),
  }, async (params, extra) => {
    const userId = getUserIdFromContext(extra);
    const result = await articleService.list(userId, {
      ...params,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
      sort: 'published_at',
      order: 'desc',
    });
    const summary = result.items.map((a) => ({
      id: a.id, title: a.title, feedTitle: a.feedTitle,
      publishedAt: a.publishedAt, isRead: a.isRead, isStarred: a.isStarred,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
  });

  server.tool('articles/get', 'Get full article content by ID', {
    articleId: z.string().uuid().describe('Article ID'),
  }, async ({ articleId }, extra) => {
    const userId = getUserIdFromContext(extra);
    const article = await articleService.getById(userId, articleId);
    if (!article) return { content: [{ type: 'text', text: 'Article not found' }] };
    return { content: [{ type: 'text', text: JSON.stringify({
      id: article.id, title: article.title, author: article.author,
      url: article.url, feedTitle: article.feedTitle,
      publishedAt: article.publishedAt, content: article.contentText?.slice(0, 3000),
      isRead: article.isRead, isStarred: article.isStarred, tags: article.tags,
    }, null, 2) }] };
  });

  server.tool('articles/search', 'Full-text search across articles', {
    q: z.string().min(1).describe('Search query'),
    page: z.number().int().min(1).optional(),
    pageSize: z.number().int().min(1).max(50).optional(),
  }, async (params, extra) => {
    const userId = getUserIdFromContext(extra);
    const result = await articleService.search(userId, {
      q: params.q, page: params.page ?? 1, pageSize: params.pageSize ?? 10,
    });
    const summary = result.items.map((a) => ({
      id: a.id, title: a.title, feedTitle: a.feedTitle, publishedAt: a.publishedAt,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
  });

  server.tool('articles/mark-read', 'Mark articles as read', {
    articleIds: z.array(z.string().uuid()).min(1).describe('Article IDs to mark read'),
  }, async ({ articleIds }, extra) => {
    const userId = getUserIdFromContext(extra);
    await articleService.markRead(userId, articleIds);
    return { content: [{ type: 'text', text: `Marked ${articleIds.length} articles as read` }] };
  });

  server.tool('articles/star', 'Star or unstar an article', {
    articleId: z.string().uuid().describe('Article ID'),
    isStarred: z.boolean().describe('Star or unstar'),
  }, async ({ articleId, isStarred }, extra) => {
    const userId = getUserIdFromContext(extra);
    await articleService.setStar(userId, articleId, isStarred);
    return { content: [{ type: 'text', text: isStarred ? 'Article starred' : 'Article unstarred' }] };
  });

  server.tool('digest/latest', 'Get the most recent morning digest', {}, async (_params, extra) => {
    const userId = getUserIdFromContext(extra);
    const digest = await digestService.getLatest(userId);
    if (!digest) return { content: [{ type: 'text', text: 'No digest available. Use digest/build to create one.' }] };
    return { content: [{ type: 'text', text: JSON.stringify(digest.content, null, 2) }] };
  });

  server.tool('digest/build', 'Build a new morning digest now', {}, async (_params, extra) => {
    const userId = getUserIdFromContext(extra);
    const digest = await digestService.buildDigest(userId);
    return { content: [{ type: 'text', text: `Digest built: ${digest.articleCount} articles, ID: ${digest.id}` }] };
  });

  server.tool('ai/summarize', 'Summarize an article using AI', {
    articleId: z.string().uuid().describe('Article ID to summarize'),
  }, async ({ articleId }, extra) => {
    const userId = getUserIdFromContext(extra);
    const summary = await aiService.summarize(userId, articleId);
    if (!summary) return { content: [{ type: 'text', text: 'AI not configured or summarization failed. Configure AI in settings.' }] };
    return { content: [{ type: 'text', text: summary }] };
  });

  server.tool('ai/suggest-tags', 'Get AI-suggested tags for an article', {
    articleId: z.string().uuid().describe('Article ID'),
  }, async ({ articleId }, extra) => {
    const userId = getUserIdFromContext(extra);
    const suggestions = await aiService.suggestTags(userId, articleId);
    return { content: [{ type: 'text', text: suggestions.length > 0 ? `Suggested tags: ${suggestions.join(', ')}` : 'No suggestions (AI may not be configured)' }] };
  });

  server.tool('folders/list', 'List all folders', {}, async (_params, extra) => {
    const userId = getUserIdFromContext(extra);
    const result = await folderService.listForUser(userId);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('folders/create', 'Create a new folder', {
    name: z.string().describe('Folder name'),
    parentId: z.string().uuid().optional().describe('Parent folder ID'),
  }, async ({ name, parentId }, extra) => {
    const userId = getUserIdFromContext(extra);
    const folder = await folderService.create(userId, name, parentId);
    return { content: [{ type: 'text', text: `Folder "${name}" created with ID: ${folder.id}` }] };
  });

  server.tool('tags/list', 'List all tags', {}, async (_params, extra) => {
    const userId = getUserIdFromContext(extra);
    const result = await tagService.listForUser(userId);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('tags/create', 'Create a new tag', {
    name: z.string().describe('Tag name'),
    color: z.string().optional().describe('Hex color code'),
  }, async ({ name, color }, extra) => {
    const userId = getUserIdFromContext(extra);
    const tag = await tagService.create(userId, name, color);
    return { content: [{ type: 'text', text: `Tag "${name}" created with ID: ${tag.id}` }] };
  });

  // === PROMPTS ===

  server.prompt('morning-briefing', 'Generate a prompt for summarizing today\'s unread articles', {}, async (_, extra) => ({
    messages: [{
      role: 'user',
      content: { type: 'text', text: 'Please use the digest/latest tool to get my morning briefing, then summarize the key themes and recommend which articles I should read first.' },
    }],
  }));

  server.prompt('research-topic', 'Research a topic across your feeds', {
    topic: z.string().describe('Topic to research'),
  }, async ({ topic }) => ({
    messages: [{
      role: 'user',
      content: { type: 'text', text: `Search my feeds for articles about "${topic}" using the articles/search tool, then summarize the findings and key takeaways.` },
    }],
  }));

  return server;
}

function getUserIdFromContext(extra: unknown): string {
  // In a real implementation, the userId would come from the MCP auth context
  // For now, we extract from sessionId or use a default
  const ctx = extra as { sessionId?: string; userId?: string } | undefined;
  if (ctx?.userId) return ctx.userId;
  // Fallback: the MCP transport should inject this
  throw new Error('User context not available. Authenticate via API key in the MCP session.');
}

export async function registerMcpRoutes(app: FastifyInstance) {
  const logger = getLogger();

  app.post('/mcp', async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Authorization required' });
    }

    try {
      await app.authenticate(req);
    } catch {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => req.user.id });

    await server.connect(transport);

    const body = req.body as Record<string, unknown>;
    await transport.handleRequest(req.raw, reply.raw, body);
  });

  logger.info('MCP server registered at /mcp');
}
