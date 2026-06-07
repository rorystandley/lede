import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../db/client.js';
import { feedService } from './feed.service.js';
import { folderService } from './folder.service.js';
import { getLogger } from '../lib/logger.js';
import { generateOpml, parseOpml } from '../lib/opml-parser.js';
import { opmlService } from './opml.service.js';

vi.mock('../db/client.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('./feed.service.js', () => ({
  feedService: {
    subscribe: vi.fn(),
  },
}));

vi.mock('./folder.service.js', () => ({
  folderService: {
    create: vi.fn(),
  },
}));

vi.mock('../lib/opml-parser.js', () => ({
  parseOpml: vi.fn(),
  generateOpml: vi.fn(),
}));

vi.mock('../lib/logger.js', () => ({
  getLogger: vi.fn(),
}));

describe('opmlService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLogger).mockReturnValue({ warn: vi.fn() } as never);
  });

  it('imports feeds, skips duplicates, and records failures', async () => {
    vi.mocked(parseOpml).mockReturnValue([
      { title: 'Tech', xmlUrl: 'https://tech.example/feed.xml', children: [] },
      { title: 'Duplicate', xmlUrl: 'https://dup.example/feed.xml', children: [] },
      { title: 'Broken', xmlUrl: 'https://broken.example/feed.xml', children: [] },
      {
        title: 'Folder',
        children: [{ title: 'Inside', xmlUrl: 'https://inside.example/feed.xml', children: [] }],
      },
    ] as never);

    vi.mocked(folderService.create).mockResolvedValue({ id: 'folder-1' } as never);
    vi.mocked(feedService.subscribe)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Already subscribed to feed'))
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(undefined);

    const logger = { warn: vi.fn() };
    vi.mocked(getLogger).mockReturnValue(logger as never);

    await expect(opmlService.importOpml('user-1', '<opml />')).resolves.toEqual({
      imported: 2,
      failed: 1,
      errors: ['Broken: Network down'],
    });

    expect(folderService.create).toHaveBeenCalledWith('user-1', 'Folder');
    expect(feedService.subscribe).toHaveBeenNthCalledWith(1, 'user-1', 'https://tech.example/feed.xml', undefined, 'Tech');
    expect(feedService.subscribe).toHaveBeenNthCalledWith(4, 'user-1', 'https://inside.example/feed.xml', 'folder-1', 'Inside');
    expect(logger.warn).toHaveBeenCalledWith(
      { url: 'https://broken.example/feed.xml', error: 'Network down' },
      'Failed to import feed',
    );
  });

  it('continues nested imports when folder creation fails', async () => {
    vi.mocked(parseOpml).mockReturnValue([
      {
        title: 'Existing Folder',
        children: [{ title: 'Nested', xmlUrl: 'https://nested.example/feed.xml', children: [] }],
      },
    ] as never);
    vi.mocked(folderService.create).mockRejectedValue(new Error('Folder exists'));
    vi.mocked(feedService.subscribe).mockResolvedValue(undefined);

    await expect(opmlService.importOpml('user-1', '<opml />')).resolves.toEqual({
      imported: 1,
      failed: 0,
      errors: [],
    });

    expect(feedService.subscribe).toHaveBeenCalledWith(
      'user-1',
      'https://nested.example/feed.xml',
      undefined,
      'Nested',
    );
  });

  it('records unknown import errors when a feed throws a non-Error value', async () => {
    vi.mocked(parseOpml).mockReturnValue([
      { title: 'Odd Feed', xmlUrl: 'https://odd.example/feed.xml', children: [] },
    ] as never);
    vi.mocked(feedService.subscribe).mockRejectedValue('odd failure');
    const logger = { warn: vi.fn() };
    vi.mocked(getLogger).mockReturnValue(logger as never);

    await expect(opmlService.importOpml('user-1', '<opml />')).resolves.toEqual({
      imported: 0,
      failed: 1,
      errors: ['Odd Feed: Unknown error'],
    });

    expect(logger.warn).toHaveBeenCalledWith(
      { url: 'https://odd.example/feed.xml', error: 'Unknown error' },
      'Failed to import feed',
    );
  });

  it('exports subscriptions grouped by folder', async () => {
    const where = vi.fn().mockResolvedValue([
      {
        feedUrl: 'https://tech.example/feed.xml',
        feedTitle: 'Tech Daily',
        feedSiteUrl: 'https://tech.example',
        folderName: 'Tech',
        customTitle: null,
      },
      {
        feedUrl: 'https://custom.example/feed.xml',
        feedTitle: 'Original',
        feedSiteUrl: null,
        folderName: null,
        customTitle: 'Custom Title',
      },
    ]);
    const leftJoin = vi.fn(() => ({ where }));
    const innerJoin = vi.fn(() => ({ leftJoin }));
    const from = vi.fn(() => ({ innerJoin }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from })),
    } as never);
    vi.mocked(generateOpml).mockReturnValue('<opml>export</opml>');

    await expect(opmlService.exportOpml('user-1')).resolves.toBe('<opml>export</opml>');
    expect(generateOpml).toHaveBeenCalledWith('lede Export', [
      {
        title: 'Tech',
        children: [
          {
            title: 'Tech Daily',
            xmlUrl: 'https://tech.example/feed.xml',
            htmlUrl: 'https://tech.example',
            type: 'rss',
            children: [],
          },
        ],
      },
      {
        title: 'Custom Title',
        xmlUrl: 'https://custom.example/feed.xml',
        htmlUrl: undefined,
        type: 'rss',
        children: [],
      },
    ]);
  });

  it('falls back to feed URLs when titles are missing during export', async () => {
    const where = vi.fn().mockResolvedValue([
      {
        feedUrl: 'https://untitled.example/feed.xml',
        feedTitle: null,
        feedSiteUrl: null,
        folderName: null,
        customTitle: null,
      },
    ]);
    const leftJoin = vi.fn(() => ({ where }));
    const innerJoin = vi.fn(() => ({ leftJoin }));
    const from = vi.fn(() => ({ innerJoin }));

    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({ from })),
    } as never);
    vi.mocked(generateOpml).mockReturnValue('<opml>fallback</opml>');

    await expect(opmlService.exportOpml('user-1')).resolves.toBe('<opml>fallback</opml>');
    expect(generateOpml).toHaveBeenCalledWith('lede Export', [
      {
        title: 'https://untitled.example/feed.xml',
        xmlUrl: 'https://untitled.example/feed.xml',
        htmlUrl: undefined,
        type: 'rss',
        children: [],
      },
    ]);
  });
});
