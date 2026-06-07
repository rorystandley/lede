import { describe, expect, it } from 'vitest';
import { FEED_CATEGORIES, FEED_DIRECTORY } from './feed-directory.js';

describe('feed directory', () => {
  it('contains well-formed entries', () => {
    expect(FEED_DIRECTORY.length).toBeGreaterThan(10);

    for (const feed of FEED_DIRECTORY) {
      expect(feed.name).toBeTruthy();
      expect(feed.url.startsWith('https://')).toBe(true);
      expect(feed.siteUrl.startsWith('https://')).toBe(true);
      expect(feed.description).toBeTruthy();
      expect(feed.category).toBeTruthy();
    }
  });

  it('derives stable unique categories in feed order', () => {
    const derivedCategories = [...new Set(FEED_DIRECTORY.map((feed) => feed.category))];

    expect(FEED_CATEGORIES).toEqual(derivedCategories);
    expect(FEED_CATEGORIES).toContain('Tech');
    expect(FEED_CATEGORIES).toContain('AI');
    expect(FEED_CATEGORIES.indexOf('Tech')).toBeLessThan(FEED_CATEGORIES.indexOf('AI'));
  });
});
