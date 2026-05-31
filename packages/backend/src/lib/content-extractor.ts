import { extract } from '@extractus/article-extractor';

export interface ExtractedContent {
  title: string | null;
  content: string | null;
  author: string | null;
  image: string | null;
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
      content: article.content ?? null,
      author: article.author ?? null,
      image: article.image ?? null,
    };
  } catch {
    return null;
  }
}
