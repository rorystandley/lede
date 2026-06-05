import Parser from 'rss-parser';
import type { FeedType } from '@lede/shared';

const parser = new Parser({
  timeout: 15000,
  maxRedirects: 5,
});

export interface ParsedFeedItem {
  guid: string;
  url: string | null;
  title: string | null;
  author: string | null;
  summary: string | null;
  contentHtml: string | null;
  imageUrl: string | null;
  publishedAt: Date | null;
}

export interface ParsedFeed {
  title: string | null;
  description: string | null;
  siteUrl: string | null;
  feedType: FeedType;
  items: ParsedFeedItem[];
}

/**
 * Detect the feed type from raw response content and content-type header.
 */
function detectFeedType(body: string, contentType: string): FeedType {
  const ct = contentType.toLowerCase();

  // Check content-type header for JSON Feed
  if (ct.includes('application/feed+json') || ct.includes('application/json')) {
    try {
      const json = JSON.parse(body);
      if (typeof json.version === 'string' && json.version.startsWith('https://jsonfeed.org/')) {
        return 'json';
      }
    } catch {
      // Not valid JSON, fall through to XML detection
    }
  }

  // Try JSON detection even without matching content-type (some servers misconfigure)
  const trimmed = body.trimStart();
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(body);
      if (typeof json.version === 'string' && json.version.startsWith('https://jsonfeed.org/')) {
        return 'json';
      }
    } catch {
      // Not JSON
    }
  }

  // Atom: <feed> element with Atom namespace
  if (trimmed.includes('<feed') && trimmed.includes('http://www.w3.org/2005/Atom')) {
    return 'atom';
  }

  // Everything else is RSS (RSS 2.0, RSS 1.0/RDF, RSS 0.9x)
  return 'rss';
}

/**
 * Parse a JSON Feed (https://jsonfeed.org/version/1.1) into our normalized format.
 */
function parseJsonFeed(body: string): ParsedFeed {
  const json = JSON.parse(body);

  const items: ParsedFeedItem[] = (json.items ?? []).map((item: Record<string, unknown>) => {
    const contentHtml = (item.content_html as string) ?? null;
    const summary = (item.summary as string) ?? null;

    let imageUrl: string | null = (item.image as string) ?? (item.banner_image as string) ?? null;
    if (!imageUrl && contentHtml) {
      const match = contentHtml.match(/<img[^>]+src=["']([^"']+)["']/);
      if (match) imageUrl = match[1];
    }

    const authors = item.authors as Array<{ name?: string }> | undefined;
    const author = (item.author as { name?: string })?.name
      ?? authors?.[0]?.name
      ?? null;

    const dateStr = (item.date_published ?? item.date_modified) as string | undefined;

    return {
      guid: (item.id as string) ?? (item.url as string) ?? (item.title as string) ?? crypto.randomUUID(),
      url: (item.url as string) ?? (item.external_url as string) ?? null,
      title: (item.title as string) ?? null,
      author,
      summary,
      contentHtml,
      imageUrl,
      publishedAt: dateStr ? new Date(dateStr) : null,
    };
  });

  return {
    title: (json.title as string) ?? null,
    description: (json.description as string) ?? null,
    siteUrl: (json.home_page_url as string) ?? null,
    feedType: 'json',
    items,
  };
}

/**
 * Fetch a feed URL, detect its type, and parse it into a normalized structure.
 */
export async function parseFeed(url: string): Promise<ParsedFeed> {
  // Fetch raw content so we can inspect it to detect the feed type
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'NewsReader/1.0',
      Accept: 'application/rss+xml, application/atom+xml, application/xml, application/feed+json, text/xml',
    },
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch feed: HTTP ${response.status}`);
  }

  const body = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  const feedType = detectFeedType(body, contentType);

  if (feedType === 'json') {
    return parseJsonFeed(body);
  }

  // Use rss-parser for RSS and Atom XML feeds
  const feed = await parser.parseString(body);

  const items: ParsedFeedItem[] = (feed.items ?? []).map((item) => {
    const contentHtml = item['content:encoded'] ?? item.content ?? null;
    const summary = item.contentSnippet ?? item.summary ?? null;

    let imageUrl: string | null = null;
    if (item.enclosure?.type?.startsWith('image/')) {
      imageUrl = item.enclosure.url ?? null;
    }
    if (!imageUrl && contentHtml) {
      const match = contentHtml.match(/<img[^>]+src=["']([^"']+)["']/);
      if (match) imageUrl = match[1];
    }

    return {
      guid: item.guid ?? item.link ?? item.title ?? crypto.randomUUID(),
      url: item.link ?? null,
      title: item.title ?? null,
      author: item.creator ?? item.author ?? null,
      summary,
      contentHtml,
      imageUrl,
      publishedAt: item.isoDate ? new Date(item.isoDate) : null,
    };
  });

  return {
    title: feed.title ?? null,
    description: feed.description ?? null,
    siteUrl: feed.link ?? null,
    feedType,
    items,
  };
}
