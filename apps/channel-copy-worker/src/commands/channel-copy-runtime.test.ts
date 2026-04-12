import { ChannelType } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDiscordRuntimeAdapter } from './channel-copy.js';

describe('channel-copy runtime adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('collects embed payloads from source messages', async () => {
    const channel = {
      guildId: 'guild-1',
      id: 'channel-1',
      isTextBased: () => true,
      messages: {
        fetch: vi.fn().mockResolvedValue(
          new Map([
            [
              '1001',
              {
                id: '1001',
                content: '',
                embeds: [
                  {
                    title: 'Embed title',
                    description: 'Embed description',
                    url: 'https://example.com/embed',
                    toJSON: () => ({
                      title: 'Embed title',
                      description: 'Embed description',
                      url: 'https://example.com/embed',
                    }),
                  },
                ],
                attachments: new Map(),
                stickers: new Map(),
                components: [],
                system: false,
              },
            ],
          ]),
        ),
      },
      type: ChannelType.GuildText,
    };
    const client = {
      channels: {
        fetch: vi.fn().mockResolvedValue(channel),
      },
    };

    const adapter = createDiscordRuntimeAdapter(client as never);
    const messages = await adapter.listSourceMessages({
      channelId: 'channel-1',
      afterMessageId: null,
      limit: 100,
    });

    expect(messages).toEqual([
      {
        id: '1001',
        content: '',
        embeds: [
          {
            title: 'Embed title',
            description: 'Embed description',
            url: 'https://example.com/embed',
          },
        ],
        attachments: [],
        isSystem: false,
      },
    ]);
  });

  it('reposts embeds to the destination channel', async () => {
    const send = vi.fn().mockResolvedValue({ id: '2001' });
    const channel = {
      guildId: 'guild-1',
      id: 'channel-1',
      isTextBased: () => true,
      send,
      type: ChannelType.GuildText,
    };
    const client = {
      channels: {
        fetch: vi.fn().mockResolvedValue(channel),
      },
    };

    const adapter = createDiscordRuntimeAdapter(client as never);
    const result = await adapter.repostMessage({
      channelId: 'channel-1',
      content: '',
      embeds: [
        {
          title: 'Embed title',
          description: 'Embed description',
          url: 'https://example.com/embed',
        },
      ],
      attachments: [],
    });

    expect(send).toHaveBeenCalledWith({
      content: undefined,
      embeds: [
        {
          title: 'Embed title',
          description: 'Embed description',
          url: 'https://example.com/embed',
        },
      ],
      files: [],
    });
    expect(result).toEqual({ destinationMessageId: '2001' });
  });
});
