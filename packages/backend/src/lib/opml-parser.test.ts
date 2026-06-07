import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateOpml, parseOpml } from './opml-parser.js';

describe('opml parser', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-06T12:34:56.000Z'));
  });

  it('parses nested outlines and decodes xml entities', () => {
    const xml = `<?xml version="1.0"?>
      <opml version="2.0">
        <body>
          <outline text="Tech &amp; AI" title="Ignored title">
            <outline
              text="OpenAI &lt;Blog&gt;"
              xmlUrl="https://openai.com/blog/rss.xml"
              htmlUrl="https://openai.com/blog"
              type="rss"
            />
          </outline>
          <outline xmlUrl="https://example.com/untitled.xml" />
        </body>
      </opml>`;

    expect(parseOpml(xml)).toEqual([
      {
        title: 'Ignored title',
        xmlUrl: undefined,
        htmlUrl: undefined,
        type: undefined,
        children: [
          {
            title: 'OpenAI <Blog>',
            xmlUrl: 'https://openai.com/blog/rss.xml',
            htmlUrl: 'https://openai.com/blog',
            type: 'rss',
            children: [],
          },
        ],
      },
      {
        title: 'Untitled',
        xmlUrl: 'https://example.com/untitled.xml',
        htmlUrl: undefined,
        type: undefined,
        children: [],
      },
    ]);
  });

  it('returns an empty list when the body is missing', () => {
    expect(parseOpml('<opml><head><title>No body</title></head></opml>')).toEqual([]);
  });

  it('generates escaped nested opml output', () => {
    const xml = generateOpml('My & Feeds', [
      {
        title: 'Tech <Folder>',
        children: [
          {
            title: 'OpenAI "Blog"',
            xmlUrl: 'https://openai.com/blog/rss.xml?x=1&y=2',
            htmlUrl: 'https://openai.com/blog',
            type: 'rss',
            children: [],
          },
        ],
      },
    ]);

    expect(xml).toContain('<title>My &amp; Feeds</title>');
    expect(xml).toContain('<dateCreated>Sat, 06 Jun 2026 12:34:56 GMT</dateCreated>');
    expect(xml).toContain('text="Tech &lt;Folder&gt;"');
    expect(xml).toContain('title="OpenAI &quot;Blog&quot;"');
    expect(xml).toContain('xmlUrl="https://openai.com/blog/rss.xml?x=1&amp;y=2"');
    expect(xml).toContain('type="rss"');
    expect(xml).toContain('</outline>');
  });
});
