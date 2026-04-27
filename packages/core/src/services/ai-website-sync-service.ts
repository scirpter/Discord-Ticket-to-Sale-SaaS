import { createHash } from 'node:crypto';

import { err, ok, type Result } from 'neverthrow';

import { AppError, fromUnknownError } from '../domain/errors.js';
import {
  AiKnowledgeRepository,
  type AiWebsiteCrawlMode,
  type AiWebsiteSourceType,
  type AiSyncDocumentInput,
} from '../repositories/ai-knowledge-repository.js';

export type AiFetchedPage = {
  url: string;
  httpStatus: number;
  title: string | null;
  text: string;
  links?: string[];
};

export type AiFetchedText = {
  url: string;
  httpStatus: number;
  text: string;
};

export type AiWebsiteFetcher = {
  fetchPage(input: { url: string; allowSameOriginRedirect?: boolean }): Promise<AiFetchedPage>;
  fetchText?(input: { url: string }): Promise<AiFetchedText>;
};

export type AiWebsiteSyncRepositoryLike = Pick<
  AiKnowledgeRepository,
  'markSourceSyncStarted' | 'replaceSourceDocuments' | 'markSourceSyncCompleted' | 'markSourceSyncFailed'
>;

export type AiWebsiteSyncResult = {
  sourceId: string;
  url: string;
  pageTitle: string | null;
  httpStatus: number;
  contentHash: string;
  documentCount: number;
  status: 'ready';
  syncedAt: string;
};

const SITE_CRAWL_PAGE_LIMIT = 50;

function normalizeComparableUrl(value: string): string {
  return new URL(value).toString();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&#(\d+);/giu, (_, codePoint: string) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([0-9a-f]+);/giu, (_, codePoint: string) =>
      String.fromCodePoint(Number.parseInt(codePoint, 16)),
    );
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/giu, ' ')
    .replace(/<(?:br|hr)\s*\/?>/giu, '\n')
    .replace(/<\/(?:p|div|section|article|main|aside|header|footer|nav|li|ul|ol|table|tr|td|th|h[1-6])>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ');
}

function normalizeContentText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t\f\v]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function extractTitleFromHtml(html: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/iu.exec(html);
  if (!match) {
    return null;
  }

  const [, title = ''] = match;
  return normalizeContentText(title);
}

function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const linkPattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^>\s]+))/giu;
  for (const match of html.matchAll(linkPattern)) {
    const rawHref = match[1] ?? match[2] ?? match[3] ?? '';
    try {
      const parsed = new URL(decodeHtmlEntities(rawHref), baseUrl);
      parsed.hash = '';
      links.push(parsed.toString());
    } catch {
      // Ignore invalid crawl links.
    }
  }

  return [...new Set(links)];
}

export async function fetchWebsitePage(input: {
  url: string;
  allowSameOriginRedirect?: boolean;
}): Promise<AiFetchedPage> {
  const response = await fetch(input.url, {
    method: 'GET',
    redirect: input.allowSameOriginRedirect ? 'follow' : 'manual',
    headers: {
      accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
      'user-agent': 'VoodooAiWebsiteSync/1.0',
    },
  });

  if (response.status >= 300 && response.status < 400) {
    throw new AppError(
      'AI_WEBSITE_REDIRECT_BLOCKED',
      'The approved website URL redirected to a different page.',
      422,
    );
  }

  if (!response.ok) {
    throw new AppError(
      'AI_WEBSITE_FETCH_FAILED',
      `The approved website URL returned HTTP ${response.status}.`,
      502,
    );
  }

  const rawBody = await response.text();
  const title = extractTitleFromHtml(rawBody);
  const text = normalizeContentText(stripHtmlToText(rawBody));

  return {
    url: response.url || input.url,
    httpStatus: response.status,
    title,
    text,
    links: extractLinksFromHtml(rawBody, response.url || input.url),
  };
}

export async function fetchWebsiteText(input: { url: string }): Promise<AiFetchedText> {
  const response = await fetch(input.url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      accept: 'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*;q=0.8',
      'user-agent': 'VoodooAiWebsiteSync/1.0',
    },
  });

  if (!response.ok) {
    throw new AppError(
      'AI_WEBSITE_FETCH_FAILED',
      `The approved website URL returned HTTP ${response.status}.`,
      502,
    );
  }

  return {
    url: response.url || input.url,
    httpStatus: response.status,
    text: await response.text(),
  };
}

function isSkippableCrawlPath(url: URL): boolean {
  const pathname = url.pathname.toLowerCase();
  if (/\.(?:avif|bmp|css|csv|docx?|gif|ico|jpe?g|js|json|mp3|mp4|pdf|png|svg|webp|xlsx?|xml|zip)$/iu.test(pathname)) {
    return true;
  }

  return /\/(?:admin|account|cart|checkout|login|logout|sign-in|signin|wp-admin)(?:\/|$)/iu.test(pathname);
}

function normalizeCrawlUrl(rawUrl: string, origin: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || isSkippableCrawlPath(parsed)) {
    return null;
  }

  parsed.hash = '';
  return parsed.toString();
}

function extractXmlValue(xml: string, tagName: string): string | null {
  const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = new RegExp(
    `<(?:[\\w.-]+:)?${escapedTagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${escapedTagName}>`,
    'iu',
  ).exec(xml);
  return match ? normalizeContentText(stripHtmlToText(stripCdata(match[1] ?? ''))) : null;
}

function stripCdata(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/giu, '$1');
}

function extractAtomLink(entryXml: string): string | null {
  const hrefMatch = /<link\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')/iu.exec(entryXml);
  if (hrefMatch) {
    return normalizeContentText(hrefMatch[1] ?? hrefMatch[2] ?? '');
  }

  return extractXmlValue(entryXml, 'link');
}

function parseFeedItems(feedXml: string, feedUrl: string, httpStatus: number): AiSyncDocumentInput[] {
  const itemMatches = [...feedXml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/giu)].map((match) => match[1] ?? '');
  const atomMatches = [...feedXml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/giu)].map((match) => match[1] ?? '');
  const entries = itemMatches.length > 0 ? itemMatches : atomMatches;

  return entries.slice(0, SITE_CRAWL_PAGE_LIMIT).flatMap((entryXml) => {
    const title = extractXmlValue(entryXml, 'title');
    const link = itemMatches.length > 0 ? extractXmlValue(entryXml, 'link') : extractAtomLink(entryXml);
    const publishedAt =
      extractXmlValue(entryXml, 'pubDate') ?? extractXmlValue(entryXml, 'published') ?? extractXmlValue(entryXml, 'updated');
    const body =
      extractXmlValue(entryXml, 'description') ??
      extractXmlValue(entryXml, 'summary') ??
      extractXmlValue(entryXml, 'encoded') ??
      extractXmlValue(entryXml, 'content');
    const contentText = normalizeContentText([title, link, publishedAt, body].filter(Boolean).join('\n'));
    if (!contentText) {
      return [];
    }

    return [
      {
        documentType: 'rss_item',
        contentText,
        contentHash: createHash('sha256').update(contentText).digest('hex'),
        metadataJson: {
          title,
          url: link ?? feedUrl,
          feedUrl,
          publishedAt,
          httpStatus,
        },
      },
    ];
  });
}

function dedupeDocumentsByHash(documents: AiSyncDocumentInput[]): AiSyncDocumentInput[] {
  const seenContentHashes = new Set<string>();
  return documents.filter((document) => {
    if (seenContentHashes.has(document.contentHash)) {
      return false;
    }

    seenContentHashes.add(document.contentHash);
    return true;
  });
}

export class AiWebsiteSyncService {
  constructor(
    private readonly repository: AiWebsiteSyncRepositoryLike = new AiKnowledgeRepository(),
    private readonly websiteFetcher: AiWebsiteFetcher = {
      fetchPage: fetchWebsitePage,
      fetchText: fetchWebsiteText,
    },
  ) {}

  public async syncSource(input: {
    guildId: string;
    sourceId: string;
    url: string;
    sourceType?: AiWebsiteSourceType;
    crawlMode?: AiWebsiteCrawlMode;
    updatedByDiscordUserId?: string | null;
  }): Promise<Result<AiWebsiteSyncResult, AppError>> {
    let started = false;

    try {
      await this.repository.markSourceSyncStarted({
        guildId: input.guildId,
        sourceId: input.sourceId,
        updatedByDiscordUserId: input.updatedByDiscordUserId ?? null,
      });
      started = true;

      const syncPayload =
        input.sourceType === 'rss_feed'
          ? await this.buildRssDocuments(input.url)
          : input.crawlMode === 'site'
            ? await this.buildSiteDocuments(input.url)
            : await this.buildPageDocuments(input.url);

      const syncedAt = new Date();
      const documentsToStore = dedupeDocumentsByHash(syncPayload.documents);
      const documents = await this.repository.replaceSourceDocuments({
        guildId: input.guildId,
        sourceId: input.sourceId,
        documents: documentsToStore,
      });

      await this.repository.markSourceSyncCompleted({
        guildId: input.guildId,
        sourceId: input.sourceId,
        httpStatus: syncPayload.httpStatus,
        pageTitle: syncPayload.pageTitle,
        contentHash: syncPayload.contentHash,
        documentCount: documents.length,
        syncedAt,
        updatedByDiscordUserId: input.updatedByDiscordUserId ?? null,
      });

      return ok({
        sourceId: input.sourceId,
        url: input.url,
        pageTitle: syncPayload.pageTitle,
        httpStatus: syncPayload.httpStatus,
        contentHash: syncPayload.contentHash,
        documentCount: documents.length,
        status: 'ready',
        syncedAt: syncedAt.toISOString(),
      });
    } catch (error) {
      const failure = fromUnknownError(error, 'AI_WEBSITE_SYNC_FAILED');

      if (started) {
        try {
          await this.repository.markSourceSyncFailed({
            guildId: input.guildId,
            sourceId: input.sourceId,
            errorMessage: failure.message,
            updatedByDiscordUserId: input.updatedByDiscordUserId ?? null,
          });
        } catch {
          // Preserve the original sync failure.
        }
      }

      return err(failure);
    }
  }

  private async buildPageDocuments(url: string): Promise<{
    documents: AiSyncDocumentInput[];
    pageTitle: string | null;
    httpStatus: number;
    contentHash: string;
  }> {
    const page = await this.websiteFetcher.fetchPage({ url });

    if (normalizeComparableUrl(page.url) !== normalizeComparableUrl(url)) {
      throw new AppError(
        'AI_WEBSITE_URL_MISMATCH',
        'The approved website URL resolved to a different page.',
        422,
      );
    }

    const normalizedText = normalizeContentText(page.text);
    if (!normalizedText) {
      throw new AppError(
        'AI_WEBSITE_EMPTY_CONTENT',
        'The approved website URL did not contain usable text content.',
        422,
      );
    }

    const pageTitle = normalizeContentText(page.title ?? '') || null;
    const contentHash = createHash('sha256').update(normalizedText).digest('hex');
    return {
      pageTitle,
      httpStatus: page.httpStatus,
      contentHash,
      documents: [
        {
          documentType: 'website_page',
          contentText: normalizedText,
          contentHash,
          metadataJson: {
            title: pageTitle,
            url,
            httpStatus: page.httpStatus,
          },
        },
      ],
    };
  }

  private async buildSiteDocuments(url: string): Promise<{
    documents: AiSyncDocumentInput[];
    pageTitle: string | null;
    httpStatus: number;
    contentHash: string;
  }> {
    const origin = new URL(url).origin;
    const queue = [url];
    const seen = new Set<string>();
    const documents: AiSyncDocumentInput[] = [];
    let firstTitle: string | null = null;
    let firstStatus = 200;

    while (queue.length > 0 && seen.size < SITE_CRAWL_PAGE_LIMIT) {
      const current = queue.shift();
      if (!current) {
        break;
      }

      const normalizedCurrent = normalizeCrawlUrl(current, origin);
      if (!normalizedCurrent || seen.has(normalizedCurrent)) {
        continue;
      }
      seen.add(normalizedCurrent);

      let page: AiFetchedPage;
      try {
        page = await this.websiteFetcher.fetchPage({
          url: normalizedCurrent,
          allowSameOriginRedirect: true,
        });
      } catch (error) {
        if (seen.size === 1 && documents.length === 0) {
          throw error;
        }

        continue;
      }
      const resolvedUrl = normalizeCrawlUrl(page.url, origin);
      if (!resolvedUrl) {
        continue;
      }

      const normalizedText = normalizeContentText(page.text);
      const pageTitle = normalizeContentText(page.title ?? '') || null;
      if (documents.length === 0) {
        firstTitle = pageTitle;
        firstStatus = page.httpStatus;
      }

      if (normalizedText) {
        const contentHash = createHash('sha256').update(normalizedText).digest('hex');
        documents.push({
          documentType: 'website_page',
          contentText: normalizedText,
          contentHash,
          metadataJson: {
            title: pageTitle,
            url: resolvedUrl,
            httpStatus: page.httpStatus,
          },
        });
      }

      for (const link of page.links ?? []) {
        const normalizedLink = normalizeCrawlUrl(link, origin);
        if (normalizedLink && !seen.has(normalizedLink) && queue.length + seen.size < SITE_CRAWL_PAGE_LIMIT) {
          queue.push(normalizedLink);
        }
      }
    }

    if (documents.length === 0) {
      throw new AppError(
        'AI_WEBSITE_EMPTY_CONTENT',
        'The approved website URL did not contain usable text content.',
        422,
      );
    }

    const contentHash = createHash('sha256')
      .update(documents.map((document) => document.contentHash).join('\n'))
      .digest('hex');
    return {
      documents,
      pageTitle: firstTitle,
      httpStatus: firstStatus,
      contentHash,
    };
  }

  private async buildRssDocuments(url: string): Promise<{
    documents: AiSyncDocumentInput[];
    pageTitle: string | null;
    httpStatus: number;
    contentHash: string;
  }> {
    const fetchText = this.websiteFetcher.fetchText ?? fetchWebsiteText;
    const feed = await fetchText({ url });
    const documents = parseFeedItems(feed.text, url, feed.httpStatus);
    if (documents.length === 0) {
      throw new AppError('AI_RSS_EMPTY_CONTENT', 'The RSS feed did not contain usable items.', 422);
    }

    const pageTitle = extractXmlValue(feed.text, 'title');
    const contentHash = createHash('sha256')
      .update(documents.map((document) => document.contentHash).join('\n'))
      .digest('hex');
    return {
      documents,
      pageTitle,
      httpStatus: feed.httpStatus,
      contentHash,
    };
  }
}
