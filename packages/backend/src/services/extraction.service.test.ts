import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../db/client.js';
import { extractArticleContent } from '../lib/content-extractor.js';
import { fetchPageMetadata } from '../lib/page-metadata.js';
import { getLogger } from '../lib/logger.js';
import {
  articleHtmlToText,
  sanitizeArticleHtml,
  sanitizeArticleImageUrl,
} from '../lib/html-sanitizer.js';
import { extractionService } from './extraction.service.js';

vi.mock('../db/client.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('../lib/content-extractor.js', () => ({
  extractArticleContent: vi.fn(),
}));

vi.mock('../lib/page-metadata.js', () => ({
  fetchPageMetadata: vi.fn(),
}));

vi.mock('../lib/logger.js', () => ({
  getLogger: vi.fn(),
}));

vi.mock('../lib/html-sanitizer.js', () => ({
  articleHtmlToText: vi.fn(),
  sanitizeArticleHtml: vi.fn(),
  sanitizeArticleImageUrl: vi.fn(),
}));

describe('extractionService', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLogger).mockReturnValue(logger as never);
    vi.mocked(sanitizeArticleImageUrl).mockImplementation((value) => value ?? null);
  });

  it('returns failed when the article is missing or has no URL', async () => {
    const missingWhere = vi.fn().mockResolvedValue([]);
    const missingFrom = vi.fn(() => ({ where: missingWhere }));
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from: missingFrom })),
    } as never);

    await expect(extractionService.extractNow('missing')).resolves.toEqual({ status: 'failed' });

    const noUrlWhere = vi.fn().mockResolvedValue([{ id: 'article-1', url: null }]);
    const noUrlFrom = vi.fn(() => ({ where: noUrlWhere }));
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from: noUrlFrom })),
    } as never);

    await expect(extractionService.extractNow('article-1')).resolves.toEqual({ status: 'failed' });
  });

  it('stores a full extraction when readability returns article content', async () => {
    const article = {
      id: 'article-1',
      url: 'https://example.com/story',
      imageUrl: 'https://example.com/original.jpg',
    };
    const selectWhere = vi.fn().mockResolvedValue([article]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: updateSet })),
    } as never);
    vi.mocked(extractArticleContent).mockResolvedValue({
      content: '<article><p>Hello world from extraction</p></article>',
      image: 'https://example.com/extracted.jpg',
    } as never);
    vi.mocked(sanitizeArticleHtml).mockReturnValue('<article><p>Hello world from extraction</p></article>');
    vi.mocked(articleHtmlToText).mockReturnValue('Hello world from extraction');

    await expect(extractionService.extractNow('article-1')).resolves.toEqual({
      status: 'full',
      contentHtml: '<article><p>Hello world from extraction</p></article>',
      contentText: 'Hello world from extraction',
      wordCount: 4,
      imageUrl: 'https://example.com/extracted.jpg',
    });

    expect(updateSet).toHaveBeenCalledWith({
      contentHtml: '<article><p>Hello world from extraction</p></article>',
      contentText: 'Hello world from extraction',
      wordCount: 4,
      imageUrl: 'https://example.com/extracted.jpg',
    });
    expect(logger.info).toHaveBeenCalledWith({ articleId: 'article-1', words: 4 }, 'Full extraction succeeded');
  });

  it('falls back to the existing image when readability returns no usable image url', async () => {
    const article = {
      id: 'article-1',
      url: 'https://example.com/story',
      imageUrl: 'https://example.com/original.jpg',
    };
    const selectWhere = vi.fn().mockResolvedValue([article]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: updateSet })),
    } as never);
    vi.mocked(extractArticleContent).mockResolvedValue({
      content: '<article><p>Body text</p></article>',
      image: null,
    } as never);
    vi.mocked(sanitizeArticleHtml).mockReturnValue('<article><p>Body text</p></article>');
    vi.mocked(articleHtmlToText).mockReturnValue('Body text');
    vi.mocked(sanitizeArticleImageUrl)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce('https://example.com/original.jpg');

    await expect(extractionService.extractNow('article-1')).resolves.toEqual({
      status: 'full',
      contentHtml: '<article><p>Body text</p></article>',
      contentText: 'Body text',
      wordCount: 2,
      imageUrl: 'https://example.com/original.jpg',
    });
  });

  it('falls back to metadata and strips any existing synthetic metadata block', async () => {
    const article = {
      id: 'article-1',
      url: 'https://example.com/story',
      imageUrl: null,
      contentHtml: '<!-- nr:meta --><p>old</p><!-- /nr:meta --><p>Body</p>',
      contentText: 'Body',
    };
    const selectWhere = vi.fn().mockResolvedValue([article]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: updateSet })),
    } as never);
    vi.mocked(extractArticleContent).mockResolvedValue(null as never);
    vi.mocked(fetchPageMetadata).mockResolvedValue({
      image: 'https://example.com/hero.jpg',
      description: 'Fresh description',
      title: 'Meta title',
    } as never);
    vi.mocked(sanitizeArticleHtml).mockImplementation((value) => value ?? '');
    vi.mocked(articleHtmlToText).mockImplementation((value) => (value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

    await expect(extractionService.extractNow('article-1')).resolves.toEqual({
      status: 'metadata',
      imageUrl: 'https://example.com/hero.jpg',
      description: 'Fresh description',
      title: 'Meta title',
    });

    expect(updateSet).toHaveBeenCalledWith({
      contentHtml: expect.stringContaining('Fresh description'),
      contentText: expect.stringContaining('Fresh description'),
      wordCount: expect.any(Number),
      imageUrl: 'https://example.com/hero.jpg',
    });
    expect(logger.info).toHaveBeenCalledWith(
      { articleId: 'article-1', hasImage: true, hasDescription: true },
      'Metadata fallback succeeded',
    );
  });

  it('returns failed when metadata adds nothing useful after extraction misses', async () => {
    const article = {
      id: 'article-1',
      url: 'https://example.com/story',
      imageUrl: 'https://example.com/original.jpg',
      contentHtml: '<p>Body</p>',
      contentText: 'Body',
    };
    const selectWhere = vi.fn().mockResolvedValue([article]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
    } as never);
    vi.mocked(extractArticleContent).mockResolvedValue({ content: null } as never);
    vi.mocked(sanitizeArticleHtml).mockReturnValue('');
    vi.mocked(fetchPageMetadata).mockResolvedValue({
      image: null,
      description: null,
      title: null,
    } as never);

    await expect(extractionService.extractNow('article-1')).resolves.toEqual({ status: 'failed' });
    expect(logger.warn).toHaveBeenCalledWith(
      { articleId: 'article-1', url: 'https://example.com/story' },
      'Both extraction stages failed',
    );
  });

  it('stores metadata when only an image is gained and preserves the base html branch', async () => {
    const article = {
      id: 'article-2',
      url: 'https://example.com/image-only',
      imageUrl: null,
      contentHtml: '<p>Existing body</p>',
      contentText: 'Existing body',
    };
    const selectWhere = vi.fn().mockResolvedValue([article]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: updateSet })),
    } as never);
    vi.mocked(extractArticleContent).mockResolvedValue(null as never);
    vi.mocked(fetchPageMetadata).mockResolvedValue({
      image: 'https://example.com/hero-only.jpg',
      description: null,
      title: 'Image only',
    } as never);
    vi.mocked(sanitizeArticleHtml).mockImplementation((value) => value ?? '');
    vi.mocked(articleHtmlToText).mockReturnValue('Existing body');

    await expect(extractionService.extractNow('article-2')).resolves.toEqual({
      status: 'metadata',
      imageUrl: 'https://example.com/hero-only.jpg',
      description: null,
      title: 'Image only',
    });

    expect(updateSet).toHaveBeenCalledWith({
      contentHtml: '<p>Existing body</p>',
      contentText: 'Existing body',
      wordCount: 2,
      imageUrl: 'https://example.com/hero-only.jpg',
    });
  });

  it('falls back to the stored html, text, and image when synthesized metadata content sanitizes away', async () => {
    const article = {
      id: 'article-3',
      url: 'https://example.com/fallbacks',
      imageUrl: 'https://example.com/original.jpg',
      contentHtml: '<p>Existing body</p>',
      contentText: 'Existing body',
    };
    const selectWhere = vi.fn().mockResolvedValue([article]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: updateSet })),
    } as never);
    vi.mocked(extractArticleContent).mockResolvedValue(null as never);
    vi.mocked(fetchPageMetadata).mockResolvedValue({
      image: null,
      description: 'Fresh description',
      title: 'Fallback meta',
    } as never);
    vi.mocked(sanitizeArticleHtml).mockImplementation((value) => {
      if (value?.includes('<aside data-nr-meta="true">')) return '';
      return value ?? '';
    });
    vi.mocked(articleHtmlToText).mockImplementation((value) => (value ? value.replace(/<[^>]+>/g, ' ').trim() : ''));

    await expect(extractionService.extractNow('article-3')).resolves.toEqual({
      status: 'metadata',
      imageUrl: 'https://example.com/original.jpg',
      description: 'Fresh description',
      title: 'Fallback meta',
    });

    expect(updateSet).toHaveBeenCalledWith({
      contentHtml: '<p>Existing body</p>',
      contentText: 'Existing body',
      wordCount: 0,
      imageUrl: 'https://example.com/original.jpg',
    });
  });

  it('keeps a null image and empty base html when metadata only adds a description', async () => {
    const article = {
      id: 'article-4',
      url: 'https://example.com/description-only',
      imageUrl: null,
      contentHtml: null,
      contentText: 'Existing text',
    };
    const selectWhere = vi.fn().mockResolvedValue([article]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: updateSet })),
    } as never);
    vi.mocked(extractArticleContent).mockResolvedValue(null as never);
    vi.mocked(fetchPageMetadata).mockResolvedValue({
      image: null,
      description: 'Metadata-only description',
      title: 'Meta title',
    } as never);
    vi.mocked(sanitizeArticleHtml).mockImplementation((value) => value ?? '');
    vi.mocked(articleHtmlToText).mockReturnValue('Metadata-only description');

    await expect(extractionService.extractNow('article-4')).resolves.toEqual({
      status: 'metadata',
      imageUrl: null,
      description: 'Metadata-only description',
      title: 'Meta title',
    });

    expect(updateSet).toHaveBeenCalledWith({
      contentHtml: expect.stringContaining('Metadata-only description'),
      contentText: 'Metadata-only description',
      wordCount: 2,
      imageUrl: null,
    });
  });
});
