export type AiWebsiteSourceType = 'website' | 'rss_feed';

export function inferWebsiteSourceTypeFromUrl(value: string): AiWebsiteSourceType {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return 'website';
  }

  const pathname = parsed.pathname.toLowerCase();
  const combined = `${pathname}${parsed.search.toLowerCase()}`;

  if (
    /\.(?:rss|atom|xml)$/u.test(pathname) ||
    /(?:^|\/)(?:rss|atom|feed)(?:\/|$|\.)/u.test(pathname) ||
    /(?:[?&](?:format|type)=)(?:rss|atom|xml)(?:&|$)/u.test(combined)
  ) {
    return 'rss_feed';
  }

  return 'website';
}
