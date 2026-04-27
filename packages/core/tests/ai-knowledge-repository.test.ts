import { describe, expect, it, vi } from 'vitest';

import {
  AiKnowledgeRepository,
  type AiCustomQaRecord,
  type AiDiscordChannelMessageRecord,
  type AiKnowledgeDocumentRecord,
  type AiWebsiteSourceRecord,
} from '../src/repositories/ai-knowledge-repository.js';

const now = new Date('2026-04-27T10:00:00.000Z');

function websiteSource(overrides: Partial<AiWebsiteSourceRecord>): AiWebsiteSourceRecord {
  return {
    id: 'source-1',
    guildId: 'guild-1',
    url: 'https://example.com/',
    sourceType: 'website',
    crawlMode: 'site',
    status: 'ready',
    lastSyncedAt: now,
    lastSyncStartedAt: now,
    lastSyncError: null,
    httpStatus: 200,
    contentHash: 'hash-1',
    pageTitle: 'Example',
    documentCount: 1,
    createdByDiscordUserId: null,
    updatedByDiscordUserId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function knowledgeDocument(
  overrides: Partial<AiKnowledgeDocumentRecord>,
): AiKnowledgeDocumentRecord {
  return {
    id: 'document-1',
    guildId: 'guild-1',
    sourceId: 'source-1',
    documentType: 'website_page',
    contentText: '',
    contentHash: 'document-hash-1',
    metadataJson: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function customQa(overrides: Partial<AiCustomQaRecord>): AiCustomQaRecord {
  return {
    id: 'qa-1',
    guildId: 'guild-1',
    question: '',
    answer: '',
    createdByDiscordUserId: null,
    updatedByDiscordUserId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function discordMessage(
  overrides: Partial<AiDiscordChannelMessageRecord>,
): AiDiscordChannelMessageRecord {
  return {
    id: 'message-1',
    guildId: 'guild-1',
    sourceId: 'discord-source-1',
    channelId: 'channel-1',
    messageId: 'discord-message-1',
    authorId: null,
    contentText: '',
    contentHash: 'discord-message-hash-1',
    messageCreatedAt: now,
    messageEditedAt: null,
    metadataJson: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function mockRepositoryLists(
  repository: AiKnowledgeRepository,
  input: {
    documents: AiKnowledgeDocumentRecord[];
    sources: AiWebsiteSourceRecord[];
    customQas?: AiCustomQaRecord[];
    discordMessages?: AiDiscordChannelMessageRecord[];
  },
): void {
  vi.spyOn(repository, 'listKnowledgeDocuments').mockResolvedValue(input.documents);
  vi.spyOn(repository, 'listWebsiteSources').mockResolvedValue(input.sources);
  vi.spyOn(repository, 'listCustomQas').mockResolvedValue(input.customQas ?? []);
  vi.spyOn(repository, 'listDiscordChannelMessages').mockResolvedValue(
    input.discordMessages ?? [],
  );
}

describe('AiKnowledgeRepository evidence retrieval', () => {
  it('prefers a specific sport-site page over generic BBC/common-word matches', async () => {
    const repository = new AiKnowledgeRepository();
    mockRepositoryLists(repository, {
      sources: [
        websiteSource({
          id: 'bbc-source',
          url: 'https://www.bbc.co.uk/',
          pageTitle: 'BBC',
        }),
        websiteSource({
          id: 'sport-source',
          url: 'https://dailysportsguide.co.uk/',
          pageTitle: 'Daily Sports Guide',
        }),
      ],
      documents: [
        knowledgeDocument({
          id: 'bbc-home',
          sourceId: 'bbc-source',
          contentText:
            'BBC homepage with News Sport Weather iPlayer Sounds. What is on today TV channel guide and Premier League headlines.',
          metadataJson: {
            title: 'BBC Home',
            url: 'https://www.bbc.co.uk/',
          },
        }),
        knowledgeDocument({
          id: 'sport-premier-league',
          sourceId: 'sport-source',
          contentText:
            'Premier League listings include Manchester United v Brentford on Sky Sports Main Event and TNT Sports at 20:00.',
          metadataJson: {
            title: 'Daily Sports Guide Premier League TV channels',
            url: 'https://dailysportsguide.co.uk/premier-league/',
          },
        }),
      ],
      customQas: [
        customQa({
          id: 'qa-drink',
          question: 'What you drinking tonight?',
          answer: 'Clockwork on Stella tonight.',
        }),
      ],
    });

    const evidence = await repository.retrieveEvidence({
      guildId: 'guild-1',
      question: 'what channel is premier league on today',
      limit: 5,
    });

    expect(evidence[0]).toMatchObject({
      sourceId: 'sport-source',
      url: 'https://dailysportsguide.co.uk/premier-league/',
    });
    expect(evidence.some((item) => item.sourceType === 'custom_qa')).toBe(false);
  });

  it('keeps top website evidence diversified across domains', async () => {
    const repository = new AiKnowledgeRepository();
    mockRepositoryLists(repository, {
      sources: [
        websiteSource({ id: 'bbc-1', url: 'https://www.bbc.co.uk/sport' }),
        websiteSource({ id: 'bbc-2', url: 'https://www.bbc.co.uk/news' }),
        websiteSource({ id: 'bbc-3', url: 'https://www.bbc.co.uk/tv' }),
        websiteSource({ id: 'sport-source', url: 'https://dailysportsguide.co.uk/' }),
      ],
      documents: [
        knowledgeDocument({
          id: 'bbc-1-doc',
          sourceId: 'bbc-1',
          contentText: 'Premier League channel Sky Sports TNT Sports TV listings today.',
          metadataJson: { title: 'BBC Sport TV guide', url: 'https://www.bbc.co.uk/sport' },
        }),
        knowledgeDocument({
          id: 'bbc-2-doc',
          sourceId: 'bbc-2',
          contentText: 'Premier League channel Sky Sports TNT Sports TV listings today.',
          metadataJson: { title: 'BBC News TV guide', url: 'https://www.bbc.co.uk/news' },
        }),
        knowledgeDocument({
          id: 'bbc-3-doc',
          sourceId: 'bbc-3',
          contentText: 'Premier League channel Sky Sports TNT Sports TV listings today.',
          metadataJson: { title: 'BBC TV guide', url: 'https://www.bbc.co.uk/tv' },
        }),
        knowledgeDocument({
          id: 'sport-doc',
          sourceId: 'sport-source',
          contentText: 'Premier League channel Sky Sports TNT Sports TV listings today.',
          metadataJson: {
            title: 'Daily Sports Guide TV guide',
            url: 'https://dailysportsguide.co.uk/tv-guide/',
          },
        }),
      ],
    });

    const evidence = await repository.retrieveEvidence({
      guildId: 'guild-1',
      question: 'premier league channel',
      limit: 3,
    });

    expect(evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: 'sport-source',
          url: 'https://dailysportsguide.co.uk/tv-guide/',
        }),
      ]),
    );
    expect(evidence.filter((item) => item.url?.includes('bbc.co.uk')).length).toBeLessThanOrEqual(
      2,
    );
  });

  it('favours broadcast listing pages for football TV questions', async () => {
    const repository = new AiKnowledgeRepository();
    mockRepositoryLists(repository, {
      sources: [
        websiteSource({
          id: 'bbc-source',
          url: 'https://www.bbc.co.uk/sport/football',
          pageTitle: 'BBC Football',
        }),
        websiteSource({
          id: 'sport-source',
          url: 'https://dailysportsguide.co.uk/',
          pageTitle: 'Daily Sports Guide',
        }),
      ],
      documents: [
        knowledgeDocument({
          id: 'bbc-football',
          sourceId: 'bbc-source',
          contentText:
            'BBC Sport football scores, fixtures, tables and headlines with news, video and analysis.',
          metadataJson: {
            title: 'Scores & Fixtures - Football - BBC Sport',
            url: 'https://www.bbc.co.uk/sport/football/scores-fixtures',
          },
        }),
        knowledgeDocument({
          id: 'sport-football',
          sourceId: 'sport-source',
          contentText:
            'Daily sports guide football schedule with todays live events, PPV, VOD, Dazn, TNT Sports, Sky Sports and Amazon listings.',
          metadataJson: {
            title: 'Daily Sports Guide',
            url: 'https://dailysportsguide.co.uk/football/',
          },
        }),
      ],
    });

    const evidence = await repository.retrieveEvidence({
      guildId: 'guild-1',
      question: 'what football is on tv today',
      limit: 3,
    });

    expect(evidence[0]).toMatchObject({
      sourceId: 'sport-source',
      url: 'https://dailysportsguide.co.uk/football/',
    });
  });

  it('keeps relevant Q&A and Discord evidence when websites also match', async () => {
    const repository = new AiKnowledgeRepository();
    mockRepositoryLists(repository, {
      sources: [
        websiteSource({ id: 'site-1', url: 'https://docs-1.example.com/' }),
        websiteSource({ id: 'site-2', url: 'https://docs-2.example.com/' }),
        websiteSource({ id: 'site-3', url: 'https://docs-3.example.com/' }),
        websiteSource({ id: 'site-4', url: 'https://docs-4.example.com/' }),
        websiteSource({ id: 'site-5', url: 'https://docs-5.example.com/' }),
      ],
      documents: Array.from({ length: 5 }, (_, index) =>
        knowledgeDocument({
          id: `site-doc-${index + 1}`,
          sourceId: `site-${index + 1}`,
          contentText:
            'Support contact options include opening a support ticket and using the contact form.',
          metadataJson: {
            title: 'Support contact docs',
            url: `https://docs-${index + 1}.example.com/support/contact/`,
          },
        }),
      ),
      customQas: [
        customQa({
          id: 'qa-support',
          question: 'How do customers contact support?',
          answer: 'Customers can open a ticket in the support channel.',
        }),
      ],
      discordMessages: [
        discordMessage({
          id: 'discord-support',
          sourceId: 'discord-source-1',
          channelId: 'support-channel',
          messageId: 'support-message',
          contentText: 'Support contact update: open a ticket in #support for account help.',
        }),
      ],
    });

    const evidence = await repository.retrieveEvidence({
      guildId: 'guild-1',
      question: 'how do customers contact support',
      limit: 5,
    });

    expect(evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'custom_qa',
          sourceId: 'qa-support',
        }),
        expect.objectContaining({
          sourceType: 'discord_channel_message',
          channelId: 'support-channel',
          messageId: 'support-message',
        }),
      ]),
    );
  });
});
