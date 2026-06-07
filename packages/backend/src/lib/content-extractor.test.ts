import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  extractMock,
  sanitizeArticleHtmlMock,
  sanitizeArticleImageUrlMock,
} = vi.hoisted(() => {
  const extractMock = vi.fn();
  const sanitizeArticleHtmlMock = vi.fn((value: string | null) => value);
  const sanitizeArticleImageUrlMock = vi.fn((value: string | null) => value);

  return {
    extractMock,
    sanitizeArticleHtmlMock,
    sanitizeArticleImageUrlMock,
  };
});

vi.mock('@extractus/article-extractor', () => ({
  extract: extractMock,
}));

vi.mock('./html-sanitizer.js', () => ({
  sanitizeArticleHtml: sanitizeArticleHtmlMock,
  sanitizeArticleImageUrl: sanitizeArticleImageUrlMock,
}));

import { extractArticleContent } from './content-extractor.js';

describe('content extractor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upgrades content images and image urls before sanitizing them', async () => {
    extractMock.mockResolvedValue({
      title: 'Story',
      content: '<p>Hello</p><img src="https://cdn.example.com/w_640,h_480,c_fill,q_70/photo.jpg?width=640&height=480" srcset="bad 1x" sizes="100vw">',
      author: 'Reporter',
      image: 'https://images.example.com/cover.jpg?w=300&h=200&q=80',
    });
    sanitizeArticleHtmlMock.mockImplementation((value) => `sanitized:${value}`);
    sanitizeArticleImageUrlMock.mockImplementation((value) => `img:${value}`);

    await expect(extractArticleContent('https://example.com/story')).resolves.toEqual({
      title: 'Story',
      content: 'sanitized:<p>Hello</p><img src="https://cdn.example.com//photo.jpg">',
      author: 'Reporter',
      image: 'img:https://images.example.com/cover.jpg',
    });

    expect(extractMock).toHaveBeenCalledWith(
      'https://example.com/story',
      {},
      {
        headers: {
          'User-Agent': 'NewsReader/1.0 (Article Extractor)',
        },
      },
    );
    expect(sanitizeArticleHtmlMock).toHaveBeenCalledWith(
      '<p>Hello</p><img src="https://cdn.example.com//photo.jpg">',
    );
    expect(sanitizeArticleImageUrlMock).toHaveBeenCalledWith(
      'https://images.example.com/cover.jpg',
    );
  });

  it('returns null when the extractor yields no article or throws', async () => {
    extractMock.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('boom'));

    await expect(extractArticleContent('https://example.com/empty')).resolves.toBeNull();
    await expect(extractArticleContent('https://example.com/fail')).resolves.toBeNull();
  });

  it('passes through invalid urls and missing content safely', async () => {
    extractMock.mockResolvedValue({
      title: null,
      content: '<img src="not a url" srcset="skip 2x">',
      author: null,
      image: 'not a url',
    });

    await expect(extractArticleContent('https://example.com/odd')).resolves.toEqual({
      title: null,
      content: '<img src="not a url">',
      author: null,
      image: 'not a url',
    });
  });

  it('returns null content and image when the extractor omits them entirely', async () => {
    extractMock.mockResolvedValue({
      title: 'No media',
      content: null,
      author: 'Reporter',
      image: null,
    });

    await expect(extractArticleContent('https://example.com/no-media')).resolves.toEqual({
      title: 'No media',
      content: null,
      author: 'Reporter',
      image: null,
    });

    expect(sanitizeArticleHtmlMock).toHaveBeenCalledWith(null);
    expect(sanitizeArticleImageUrlMock).toHaveBeenCalledWith(null);
  });
});
