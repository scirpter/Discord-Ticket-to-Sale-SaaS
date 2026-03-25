import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exchangeCodeForSession } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
}));

vi.mock('@voodoo/core', () => {
  class AppError extends Error {
    public readonly code: string;
    public readonly statusCode: number;

    public constructor(code: string, message: string, statusCode: number) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  }

  return {
    AppError,
    logger: {
      warn: vi.fn(),
    },
    AuthService: class {
      public exchangeCodeForSession = exchangeCodeForSession;
    },
  };
});

vi.mock('@/lib/http', () => ({
  jsonError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock('@/lib/public-origin', () => ({
  resolvePublicOrigin: vi.fn((request: NextRequest) => request.nextUrl.origin),
}));

import { AppError } from '@voodoo/core';
import { GET } from './route';

describe('discord callback route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects callback failures back to the dashboard with a readable error', async () => {
    exchangeCodeForSession.mockResolvedValue(
      {
        isErr: () => true,
        isOk: () => false,
        error: new AppError('DISCORD_OAUTH_PROFILE_FAILED', 'Failed to fetch profile from Discord', 502),
      },
    );

    const response = await GET(
      new NextRequest(
        'https://voodoopaybot.online/api/auth/discord/callback?code=oauth-code&state=oauth-state',
        {
          headers: {
            cookie:
              'vd_oauth_state=oauth-state; vd_oauth_redirect_uri=https://voodoopaybot.online/api/auth/discord/callback',
          },
        },
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://voodoopaybot.online/dashboard?authError=Failed+to+fetch+profile+from+Discord',
    );
  });

  it('still redirects successful callbacks into the dashboard', async () => {
    exchangeCodeForSession.mockResolvedValue(
      {
        isErr: () => false,
        isOk: () => true,
        value: {
          sessionToken: 'session-token',
          discordAccessToken: 'discord-access-token',
          user: {
            id: 'user-1',
            discordUserId: 'discord-1',
            username: 'merchant',
            avatarUrl: null,
          },
          isSuperAdmin: false,
          tenantIds: ['tenant-1'],
          guilds: [],
        },
      },
    );

    const response = await GET(
      new NextRequest(
        'https://voodoopaybot.online/api/auth/discord/callback?code=oauth-code&state=oauth-state',
        {
          headers: {
            cookie:
              'vd_oauth_state=oauth-state; vd_oauth_redirect_uri=https://voodoopaybot.online/api/auth/discord/callback',
          },
        },
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://voodoopaybot.online/dashboard');
    expect(response.headers.get('set-cookie')).toContain('vd_session=session-token');
    expect(response.headers.get('set-cookie')).toContain('vd_discord_access_token=discord-access-token');
  });
});
