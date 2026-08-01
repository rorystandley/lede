/**
 * Lightweight metadata fetcher. Used as a fallback when Mozilla Readability
 * can't pull out the article body — at least we can get an og:image, a
 * description, and a clean title so the article still presents nicely.
 */

export interface PageMetadata {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  author: string | null;
}

const USER_AGENT = 'NewsReader/1.0 (Metadata Fetcher; +https://example.com)';
const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 1_500_000; // 1.5 MB — enough for head + above-the-fold

export async function fetchPageMetadata(url: string): Promise<PageMetadata | null> {
  let html: string;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    reader.cancel().catch(() => {});
    html = new TextDecoder('utf-8').decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
  } catch {
    return null;
  }

  // We only need the <head> — clip early to make regexes fast.
  const headMatch = html.match(/<head[\s\S]*?<\/head>/i);
  const head = headMatch?.[0] ?? html.slice(0, 50_000);

  const meta = {
    title: pickMeta(head, ['og:title', 'twitter:title']) ?? pickTitle(head),
    description: pickMeta(head, ['og:description', 'twitter:description', 'description']),
    image: resolveUrl(pickMeta(head, ['og:image', 'og:image:secure_url', 'twitter:image']), url),
    siteName: pickMeta(head, ['og:site_name', 'application-name']),
    author: pickMeta(head, ['author', 'article:author']),
  };

  // Filter empty strings to nulls
  return {
    title: meta.title?.trim() || null,
    description: meta.description?.trim() || null,
    image: meta.image || null,
    siteName: meta.siteName?.trim() || null,
    author: meta.author?.trim() || null,
  };
}

function pickMeta(head: string, names: string[]): string | null {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]*content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]*content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*property=["']${escaped}["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*name=["']${escaped}["']`, 'i'),
    ];
    for (const pat of patterns) {
      const m = head.match(pat);
      if (m?.[1]) return decodeEntities(m[1]);
    }
  }
  return null;
}

function pickTitle(head: string): string | null {
  const m = head.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m?.[1] ? decodeEntities(m[1]) : null;
}

function resolveUrl(maybeRelative: string | null, base: string): string | null {
  if (!maybeRelative) return null;
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(parseInt(c, 10)));
}
