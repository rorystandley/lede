import { describe, expect, it } from 'vitest';
import {
  articleHtmlToText,
  sanitizeArticleDisplayHtml,
  sanitizeArticleHtml,
  sanitizeArticleImageUrl,
} from './html-sanitizer.js';

describe('html sanitizer', () => {
  it('removes dangerous content and keeps safe article markup', () => {
    const result = sanitizeArticleHtml(
      '<article><script>alert(1)</script><p>Hello <strong>world</strong></p><a href="https://example.com" rel="ugc">Read</a><img title="bad"></article>',
    );

    expect(result).toContain('<article>');
    expect(result).toContain('<p>Hello <strong>world</strong></p>');
    expect(result).toContain('rel="ugc noopener noreferrer"');
    expect(result).toContain('noopener noreferrer');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('<img');
  });

  it('adds noopener and noreferrer when links do not already have a rel attribute', () => {
    expect(sanitizeArticleHtml('<a href="https://example.com">Read</a>')).toBe(
      '<a href="https://example.com" rel="noopener noreferrer">Read</a>',
    );
  });

  it('falls back between primary and secondary html and preserves blank fallback output', () => {
    expect(sanitizeArticleDisplayHtml('<p>Primary</p>', '<p>Fallback</p>')).toBe('<p>Primary</p>');
    expect(sanitizeArticleDisplayHtml('<script>bad</script>', '<p>Fallback</p>')).toBe('<p>Fallback</p>');
    expect(sanitizeArticleDisplayHtml('<script>bad</script>', '<script>worse</script>')).toBe('');
    expect(sanitizeArticleDisplayHtml(null, null)).toBeNull();
  });

  it('converts sanitized html to plain text', () => {
    expect(articleHtmlToText('<div>Hello <em>there</em><script>bad</script></div>')).toBe('Hello there');
    expect(articleHtmlToText(null)).toBe('');
  });

  it('accepts safe image urls and rejects unsafe ones', () => {
    expect(sanitizeArticleImageUrl('https://example.com/image.jpg')).toBe('https://example.com/image.jpg');
    expect(sanitizeArticleImageUrl('/relative/path.jpg')).toBe('/relative/path.jpg');
    expect(sanitizeArticleImageUrl('//cdn.example.com/image.jpg')).toBe('//cdn.example.com/image.jpg');
    expect(sanitizeArticleImageUrl('http://[invalid')).toBeNull();
    expect(sanitizeArticleImageUrl(' javascript:alert(1) ')).toBeNull();
    expect(sanitizeArticleImageUrl('data:image/png;base64,abc')).toBeNull();
    expect(sanitizeArticleImageUrl('bad\u0000value')).toBeNull();
    expect(sanitizeArticleImageUrl(undefined)).toBeNull();
  });
});
