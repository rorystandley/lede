/**
 * Heuristics for turning a feed's raw channel title into a clean display name.
 *
 * Some feeds use their bare URL as the title (e.g. The Register's RSS is titled
 * "www.theregister.com - Articles"); we'd rather show the site's brand name
 * ("The Register"), the way curated directories do.
 */

// Split a <title> on the separators sites use between brand and tagline:
// pipe, guillemet, colon, en/em dash, and " - " (a hyphen with spaces, so
// hyphenated brands like "CSS-Tricks" stay intact).
const TITLE_SEPARATORS = /\s*[|»:]\s*|\s+[–—]\s+|\s+-\s+/;

const JUNK_NAMES = new Set([
  'home', 'rss', 'feed', 'feeds', 'blog', 'news feed', 'rss feed', 'atom', 'articles',
]);

export function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

/**
 * A feed title is "poor" if it's empty, a raw URL, or basically the site's
 * domain — i.e. not something we'd want to show a user as a source name.
 */
export function isPoorFeedTitle(title: string | null | undefined, siteUrl: string): boolean {
  const t = (title ?? '').trim();
  if (!t) return true;
  if (/^https?:\/\//i.test(t)) return true;

  const host = getHostname(siteUrl);
  if (host && t.toLowerCase().includes(host.toLowerCase())) return true;

  // Bare domain with no spaces, e.g. "martinfowler.com".
  if (!/\s/.test(t) && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(t)) return true;

  return false;
}

/** Title-case a hostname's root label as a last resort, e.g. "theregister.com" -> "Theregister". */
export function humanizeHostname(url: string): string {
  const host = getHostname(url) ?? url;
  const base = host.split('.')[0] || host;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function looksBrandy(s: string): boolean {
  if (s.length < 2 || s.length > 40) return false;
  if (JUNK_NAMES.has(s.toLowerCase())) return false;
  if (!/[A-Z]/.test(s)) return false; // brand names are capitalised; "theregister" isn't
  if (/^https?:\/\//i.test(s)) return false;
  if (!/\s/.test(s) && /\.[a-z]{2,}$/i.test(s)) return false; // bare domain
  return true;
}

/**
 * Pull a site's brand name from its homepage HTML, combining og:site_name,
 * application-name, and the <title>'s segments. Returns the shortest "brandy"
 * candidate (taglines are long, brand names are short), or null if none fit.
 */
export function extractSiteName(html: string): string | null {
  const candidates: string[] = [];

  const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i);
  if (og) candidates.push(og[1]);

  const appName = html.match(/<meta[^>]+name=["']application-name["'][^>]*content=["']([^"']+)["']/i);
  if (appName) candidates.push(appName[1]);

  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  if (title) candidates.push(...title.split(TITLE_SEPARATORS));

  const brandy = candidates.map(decodeBasicEntities).filter(looksBrandy);
  if (brandy.length === 0) return null;

  brandy.sort((a, b) => a.length - b.length);
  return brandy[0];
}

/**
 * Choose a display title for a feed: keep its own title when it's decent,
 * otherwise fall back to the site's brand name (from homepage HTML if we have
 * it) and finally to a humanized hostname.
 */
export function deriveDisplayTitle(rawTitle: string | null, siteUrl: string, html?: string | null): string {
  if (rawTitle && !isPoorFeedTitle(rawTitle, siteUrl)) return rawTitle.trim();
  if (html) {
    const name = extractSiteName(html);
    if (name) return name;
  }
  return humanizeHostname(siteUrl);
}

/**
 * Fetch a site's homepage and extract its brand name. Used at subscribe time
 * when a feed's own title is poor and we didn't already fetch the page.
 */
export async function fetchSiteName(siteUrl: string): Promise<string | null> {
  try {
    const res = await fetch(siteUrl, {
      headers: {
        'User-Agent': 'NewsReader/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return extractSiteName(await res.text());
  } catch {
    return null;
  }
}
