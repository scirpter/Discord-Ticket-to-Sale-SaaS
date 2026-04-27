import { describe, expect, it } from 'vitest';

import { inferWebsiteSourceTypeFromUrl } from './ai-website-source-url';

describe('inferWebsiteSourceTypeFromUrl', () => {
  it('detects common RSS and Atom feed URLs', () => {
    expect(inferWebsiteSourceTypeFromUrl('https://example.com/feed.xml')).toBe('rss_feed');
    expect(inferWebsiteSourceTypeFromUrl('https://example.com/blog/rss')).toBe('rss_feed');
    expect(inferWebsiteSourceTypeFromUrl('https://example.com/atom')).toBe('rss_feed');
  });

  it('keeps normal web pages as website sources', () => {
    expect(inferWebsiteSourceTypeFromUrl('https://example.com/docs')).toBe('website');
    expect(inferWebsiteSourceTypeFromUrl('not a url')).toBe('website');
  });
});
