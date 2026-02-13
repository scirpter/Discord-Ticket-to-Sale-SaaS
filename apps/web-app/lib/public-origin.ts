import { getEnv } from '@voodoo/core';
import type { NextRequest } from 'next/server';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function firstHeaderValue(value: string | null): string {
  if (!value) {
    return '';
  }

  return value.split(',')[0]?.trim() ?? '';
}

function toHostname(hostWithPort: string): string {
  if (!hostWithPort) {
    return '';
  }

  try {
    return new URL(`http://${hostWithPort}`).hostname;
  } catch {
    return hostWithPort;
  }
}

function isLocalHost(hostWithPort: string): boolean {
  const hostname = toHostname(hostWithPort).toLowerCase();
  return LOCAL_HOSTNAMES.has(hostname);
}

export function resolvePublicOrigin(request: NextRequest): string {
  const forwardedHost = firstHeaderValue(request.headers.get('x-forwarded-host'));
  const forwardedProto = firstHeaderValue(request.headers.get('x-forwarded-proto'));
  if (forwardedHost && forwardedProto && !isLocalHost(forwardedHost)) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const requestHost = firstHeaderValue(request.headers.get('host')) || request.nextUrl.host;
  const requestProto = forwardedProto || request.nextUrl.protocol.replace(':', '');
  if (requestHost && !isLocalHost(requestHost)) {
    return `${requestProto}://${requestHost}`;
  }

  const configuredOrigin = new URL(getEnv().BOT_PUBLIC_URL).origin;
  if (!isLocalHost(new URL(configuredOrigin).host)) {
    return configuredOrigin;
  }

  return request.nextUrl.origin;
}

