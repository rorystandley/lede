import type { FeedType } from '@lede/shared';
import { parseFeed } from './feed-parser.js';

export interface DiscoveredFeed {
  url: string;
  title: string | null;
  description: string | null;
  siteUrl: string | null;
  feedType: FeedType;
  itemCount: number;
}

/**
 * Common locations sites expose feeds at when they don't advertise one via a
 * <link rel="alternate"> tag. Probed against the origin as a last resort.
 */
const COMMON_FEED_PATHS = [
  '/feed',
  '/feed/',
  '/rss',
  '/rss/',
  '/rss.xml',
  '/feed.xml',
  '/atom.xml',
  '/feed.atom',
  '/atom',
  '/index.xml',
  '/feeds/posts/default',
];

/** Cap how many candidate URLs we validate per discovery request. */
const MAX_CANDIDATES = 12;

/**
 * Turn whatever the user typed into a fetchable URL. Accepts bare hosts
 * ("theregister.com"), schemeless paths, and full URLs.
 */
export function normalizeInputUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

/**
 * A <link rel="alternate"> type is a feed if it unambiguously names a feed
 * format. We deliberately avoid generic application/xml or application/json to
 * sidestep XHTML alternates and oEmbed/manifest links.
 */
function isFeedLinkType(type: string): boolean {
  const t = type.toLowerCase();
  return t.includes('rss') || t.includes('atom') || t.includes('feed+json');
}

/**
 * Pull feed URLs advertised in a page's HTML via
 * <link rel="alternate" type="application/rss+xml|atom+xml|feed+json" href="...">.
 * Relative hrefs are resolved against baseUrl.
 */
export function extractFeedLinks(html: string, baseUrl: string): { url: string; title: string | null }[] {
  const results: { url: string; title: string | null }[] = [];
  const seen = new Set<string>();

  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    if (!/\brel=["']?[^"'>]*\balternate\b/i.test(tag)) continue;

    const type = tag.match(/\btype=["']([^"']+)["']/i)?.[1];
    if (!type || !isFeedLinkType(type)) continue;

    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href) continue;

    let abs: string;
    try {
      abs = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(abs)) continue;
    seen.add(abs);

    const title = tag.match(/\btitle=["']([^"']*)["']/i)?.[1] ?? null;
    results.push({ url: abs, title });
  }

  return results;
}

interface ValidatedCandidate {
  feed: DiscoveredFeed;
  /** Content identity, so the same feed served at /feed and /feed/ collapses to one. */
  signature: string;
}

/**
 * Try to parse a URL as a feed. When requireItems is set (for speculatively
 * discovered candidates) an empty parse is rejected so HTML pages that happen
 * to parse don't masquerade as feeds.
 */
async function validateCandidate(url: string, requireItems: boolean): Promise<ValidatedCandidate | null> {
  try {
    const parsed = await parseFeed(url);
    if (requireItems && parsed.items.length === 0) return null;
    const firstItem = parsed.items[0];
    return {
      feed: {
        url,
        title: parsed.title,
        description: parsed.description,
        siteUrl: parsed.siteUrl,
        feedType: parsed.feedType,
        itemCount: parsed.items.length,
      },
      signature: `${parsed.title ?? ''}|${firstItem?.guid ?? firstItem?.url ?? ''}`,
    };
  } catch {
    return null;
  }
}

/**
 * Given a site or feed URL, return the feeds we can subscribe to.
 *
 * 1. If the input is itself a feed, return it directly.
 * 2. Otherwise fetch the page and read advertised <link rel="alternate"> feeds.
 * 3. As a last resort, probe common feed paths against the origin.
 */
export async function discoverFeeds(input: string): Promise<DiscoveredFeed[]> {
  const url = normalizeInputUrl(input);

  // 1. The input may already point straight at a feed.
  const direct = await validateCandidate(url, false);
  if (direct) return [direct.feed];

  // 2. Fetch the page as HTML and look for advertised feeds.
  let html = '';
  let baseUrl = url;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'NewsReader/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });
    if (res.ok) {
      html = await res.text();
      baseUrl = res.url || url;
    }
  } catch {
    // Unreachable host — fall through to path probing below.
  }

  let candidates = extractFeedLinks(html, baseUrl).map((l) => l.url);

  // 3. Nothing advertised — probe the usual suspects on the origin.
  if (candidates.length === 0) {
    const origin = new URL(baseUrl).origin;
    candidates = COMMON_FEED_PATHS.map((p) => new URL(p, origin).toString());
  }

  candidates = [...new Set(candidates)].slice(0, MAX_CANDIDATES);

  const settled = await Promise.allSettled(candidates.map((c) => validateCandidate(c, true)));

  const feeds: DiscoveredFeed[] = [];
  const seenUrls = new Set<string>();
  const seenSignatures = new Set<string>();
  for (const r of settled) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const { feed, signature } = r.value;
    if (seenUrls.has(feed.url) || seenSignatures.has(signature)) continue;
    seenUrls.add(feed.url);
    seenSignatures.add(signature);
    feeds.push(feed);
  }

  return feeds;
}
