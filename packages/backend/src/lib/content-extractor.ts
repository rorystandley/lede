import { extract } from '@extractus/article-extractor';
import { sanitizeArticleHtml, sanitizeArticleImageUrl } from './html-sanitizer.js';

export interface ExtractedContent {
  title: string | null;
  content: string | null;
  author: string | null;
  image: string | null;
}

/**
 * Strip width/height/quality params from CDN URLs to grab the full-res image.
 * Covers WordPress, Cloudinary, Imgix, and the common path-based variants.
 */
function upgradeUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of ['w', 'h', 'resize', 'fit', 'crop', 'quality', 'q', 'width', 'height']) {
      u.searchParams.delete(k);
    }
    return u.toString()
      .replace(/\/w_\d+,?/g, '/')
      .replace(/\/h_\d+,?/g, '/')
      .replace(/\/c_(limit|fill|crop),?/g, '/')
      .replace(/\/q_\d+,?/g, '/');
  } catch {
    return url;
  }
}

function upgradeContentImages(html: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (_m, attrs: string) => {
    let next = attrs
      .replace(/(src=["'])([^"']+)(["'])/i, (_x, p, url, q) => `${p}${upgradeUrl(url)}${q}`)
      .replace(/\s+srcset=["'][^"']*["']/i, '')
      .replace(/\s+sizes=["'][^"']*["']/i, '');
    return `<img${next}>`;
  });
}

export async function extractArticleContent(url: string): Promise<ExtractedContent | null> {
  try {
    const article = await extract(url, {}, {
      headers: {
        'User-Agent': 'NewsReader/1.0 (Article Extractor)',
      },
    });

    if (!article) return null;

    return {
      title: article.title ?? null,
      content: sanitizeArticleHtml(article.content ? upgradeContentImages(article.content) : null),
      author: article.author ?? null,
      image: sanitizeArticleImageUrl(article.image ? upgradeUrl(article.image) : null),
    };
  } catch {
    return null;
  }
}
