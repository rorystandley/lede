import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderDigestEmail } from './digest-email-template.js';

describe('digest email template', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-06T08:00:00.000Z'));
  });

  it('renders html, text, and a dated subject with escaped content', () => {
    const result = renderDigestEmail(
      {
        date: '2026-06-06T08:00:00.000Z',
        briefing: 'Top <stories> & trends',
        stats: {
          totalArticles: 3,
          estimatedReadTimeMin: 12,
        },
        sections: [
          {
            folder: 'Tech & News',
            feeds: [
              {
                feedId: 'feed-1',
                feedTitle: 'OpenAI <Blog>',
                articles: [
                  {
                    id: 'art-1',
                    title: 'Launch & Learn',
                    url: 'https://example.com/post',
                    feedTitle: 'OpenAI <Blog>',
                    publishedAt: '2026-06-06T07:00:00.000Z',
                    aiSummary: 'Fast <summary>',
                    summary: 'Ignored because aiSummary exists',
                  },
                  {
                    id: 'art-2',
                    title: null,
                    url: null,
                    feedTitle: null,
                    publishedAt: null,
                    aiSummary: null,
                    summary: 'A'.repeat(220),
                  },
                ],
              },
            ],
          },
          {
            folder: null,
            feeds: [
              {
                feedId: 'feed-2',
                feedTitle: null,
                articles: [
                  {
                    id: 'art-3',
                    title: 'Third story',
                    url: 'https://example.com/third',
                    feedTitle: null,
                    publishedAt: null,
                    aiSummary: null,
                    summary: null,
                  },
                ],
              },
            ],
          },
        ],
      },
      'Rory & Co',
      'https://app.example.com',
    );

    expect(result.subject).toBe('Your morning briefing — Saturday, June 6 — 3 articles');
    expect(result.html).toContain('Good morning, Rory &amp; Co');
    expect(result.html).toContain('Top &lt;stories&gt; &amp; trends');
    expect(result.html).toContain('OpenAI &lt;Blog&gt;');
    expect(result.html).toContain('Fast &lt;summary&gt;');
    expect(result.html).toContain('A'.repeat(200));
    expect(result.html).not.toContain('A'.repeat(201));
    expect(result.html).toContain('href="https://app.example.com"');
    expect(result.text).toContain('Good morning, Rory & Co');
    expect(result.text).toContain('-- Tech & News --');
    expect(result.text).toContain('  • Untitled');
    expect(result.text).toContain('    https://example.com/post');
    expect(result.text).toContain('\nFeed');
    expect(result.text.trimEnd()).toMatch(/https:\/\/app\.example\.com$/);
  });

  it('falls back cleanly when there is no display name or briefing', () => {
    const result = renderDigestEmail(
      {
        date: '2026-06-06T08:00:00.000Z',
        briefing: null,
        stats: {
          totalArticles: 0,
          estimatedReadTimeMin: 0,
        },
        sections: [],
      },
      null,
      'https://app.example.com',
    );

    expect(result.html).toContain('Good morning — Saturday, June 6');
    expect(result.html).not.toContain('background:#ecfdf5');
    expect(result.text).toContain('0 articles');
  });
});
