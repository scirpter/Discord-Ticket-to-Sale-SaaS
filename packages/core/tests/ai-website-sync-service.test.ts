import { describe, expect, it, vi } from 'vitest';

import { AiWebsiteSyncService } from '../src/services/ai-website-sync-service.js';

describe('AiWebsiteSyncService', () => {
  it('stores normalized content for an exact approved URL', async () => {
    const repository = {
      markSourceSyncStarted: vi.fn().mockResolvedValue(undefined),
      replaceSourceDocuments: vi.fn().mockResolvedValue([
        {
          id: 'doc-1',
          guildId: 'guild-1',
          sourceId: 'source-1',
          documentType: 'website_page',
          contentText: 'Refunds are accepted within fourteen days.',
          contentHash: 'hash-1',
          metadataJson: {},
          createdAt: new Date('2026-04-23T10:00:00.000Z'),
          updatedAt: new Date('2026-04-23T10:00:00.000Z'),
        },
      ]),
      markSourceSyncCompleted: vi.fn().mockResolvedValue(undefined),
      markSourceSyncFailed: vi.fn().mockResolvedValue(undefined),
    };
    const service = new AiWebsiteSyncService(repository, {
      fetchPage: vi.fn().mockResolvedValue({
        url: 'https://example.com/refunds',
        httpStatus: 200,
        title: 'Refunds',
        text: '  Refunds are accepted within fourteen days.  ',
      }),
    });

    const result = await service.syncSource({
      guildId: 'guild-1',
      sourceId: 'source-1',
      url: 'https://example.com/refunds',
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }

    expect(repository.markSourceSyncStarted).toHaveBeenCalledWith({
      guildId: 'guild-1',
      sourceId: 'source-1',
      updatedByDiscordUserId: null,
    });
    expect(repository.replaceSourceDocuments).toHaveBeenCalledWith({
      guildId: 'guild-1',
      sourceId: 'source-1',
      documents: [
        expect.objectContaining({
          documentType: 'website_page',
          contentText: 'Refunds are accepted within fourteen days.',
          metadataJson: {
            title: 'Refunds',
            url: 'https://example.com/refunds',
            httpStatus: 200,
          },
        }),
      ],
    });
    expect(repository.markSourceSyncCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-1',
        sourceId: 'source-1',
        httpStatus: 200,
        pageTitle: 'Refunds',
      }),
    );
    expect(repository.markSourceSyncFailed).not.toHaveBeenCalled();
    expect(result.value).toMatchObject({
      sourceId: 'source-1',
      url: 'https://example.com/refunds',
      pageTitle: 'Refunds',
      httpStatus: 200,
      documentCount: 1,
      status: 'ready',
    });
  });

  it('fails when the fetched page does not match the approved URL', async () => {
    const repository = {
      markSourceSyncStarted: vi.fn().mockResolvedValue(undefined),
      replaceSourceDocuments: vi.fn(),
      markSourceSyncCompleted: vi.fn(),
      markSourceSyncFailed: vi.fn().mockResolvedValue(undefined),
    };
    const service = new AiWebsiteSyncService(repository as never, {
      fetchPage: vi.fn().mockResolvedValue({
        url: 'https://example.com/refunds/',
        httpStatus: 200,
        title: 'Refunds',
        text: 'Refunds are accepted within fourteen days.',
      }),
    });

    const result = await service.syncSource({
      guildId: 'guild-1',
      sourceId: 'source-1',
      url: 'https://example.com/refunds',
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }

    expect(result.error.code).toBe('AI_WEBSITE_URL_MISMATCH');
    expect(repository.replaceSourceDocuments).not.toHaveBeenCalled();
    expect(repository.markSourceSyncCompleted).not.toHaveBeenCalled();
    expect(repository.markSourceSyncFailed).toHaveBeenCalledWith({
      guildId: 'guild-1',
      sourceId: 'source-1',
      errorMessage: 'The approved website URL resolved to a different page.',
      updatedByDiscordUserId: null,
    });
  });

  it('stores multiple same-origin pages when site crawl is enabled', async () => {
    const repository = {
      markSourceSyncStarted: vi.fn().mockResolvedValue(undefined),
      replaceSourceDocuments: vi.fn().mockResolvedValue([{ id: 'doc-1' }, { id: 'doc-2' }]),
      markSourceSyncCompleted: vi.fn().mockResolvedValue(undefined),
      markSourceSyncFailed: vi.fn().mockResolvedValue(undefined),
    };
    const fetchPage = vi.fn(async ({ url }: { url: string }) => {
      if (url === 'https://example.com/docs') {
        return {
          url,
          httpStatus: 200,
          title: 'Docs',
          text: 'Start here.',
          links: [
            'https://example.com/docs/refunds',
            'https://example.com/files/manual.pdf',
            'https://other.example.com/docs',
          ],
        };
      }

      return {
        url,
        httpStatus: 200,
        title: 'Refunds',
        text: 'Refunds are accepted within fourteen days.',
        links: [],
      };
    });
    const service = new AiWebsiteSyncService(repository as never, { fetchPage });

    const result = await service.syncSource({
      guildId: 'guild-1',
      sourceId: 'source-1',
      url: 'https://example.com/docs',
      crawlMode: 'site',
      sourceType: 'website',
    });

    expect(result.isOk()).toBe(true);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(repository.replaceSourceDocuments).toHaveBeenCalledWith({
      guildId: 'guild-1',
      sourceId: 'source-1',
      documents: [
        expect.objectContaining({
          documentType: 'website_page',
          contentText: 'Start here.',
          metadataJson: expect.objectContaining({ url: 'https://example.com/docs' }),
        }),
        expect.objectContaining({
          documentType: 'website_page',
          contentText: 'Refunds are accepted within fourteen days.',
          metadataJson: expect.objectContaining({ url: 'https://example.com/docs/refunds' }),
        }),
      ],
    });
    expect(repository.markSourceSyncCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        documentCount: 2,
        pageTitle: 'Docs',
      }),
    );
  });

  it('stores RSS feed items as knowledge documents', async () => {
    const repository = {
      markSourceSyncStarted: vi.fn().mockResolvedValue(undefined),
      replaceSourceDocuments: vi.fn().mockResolvedValue([{ id: 'doc-1' }]),
      markSourceSyncCompleted: vi.fn().mockResolvedValue(undefined),
      markSourceSyncFailed: vi.fn().mockResolvedValue(undefined),
    };
    const service = new AiWebsiteSyncService(repository as never, {
      fetchPage: vi.fn(),
      fetchText: vi.fn().mockResolvedValue({
        url: 'https://example.com/feed.xml',
        httpStatus: 200,
        text: `<?xml version="1.0"?>
          <rss><channel><title>Updates</title><item>
            <title>New setup guide</title>
            <link>https://example.com/setup</link>
            <pubDate>Mon, 27 Apr 2026 10:00:00 GMT</pubDate>
            <description>Setup now takes five minutes.</description>
          </item></channel></rss>`,
      }),
    });

    const result = await service.syncSource({
      guildId: 'guild-1',
      sourceId: 'source-1',
      url: 'https://example.com/feed.xml',
      sourceType: 'rss_feed',
    });

    expect(result.isOk()).toBe(true);
    expect(repository.replaceSourceDocuments).toHaveBeenCalledWith({
      guildId: 'guild-1',
      sourceId: 'source-1',
      documents: [
        expect.objectContaining({
          documentType: 'rss_item',
          contentText: expect.stringContaining('Setup now takes five minutes.'),
          metadataJson: {
            title: 'New setup guide',
            url: 'https://example.com/setup',
            feedUrl: 'https://example.com/feed.xml',
            publishedAt: 'Mon, 27 Apr 2026 10:00:00 GMT',
            httpStatus: 200,
          },
        }),
      ],
    });
  });
});
