import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'NewsReader/1.0',
    Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
  },
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
  items: ParsedFeedItem[];
}

export async function parseFeed(url: string): Promise<ParsedFeed> {
  const feed = await parser.parseURL(url);

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
    items,
  };
}
