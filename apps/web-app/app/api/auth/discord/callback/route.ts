import { AuthService, logger } from '@voodoo/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/http';
import { resolvePublicOrigin } from '@/lib/public-origin';

const authService = new AuthService();

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const expectedState = request.cookies.get('vd_oauth_state')?.value ?? '';
    const publicOrigin = resolvePublicOrigin(request);
    const redirectUri =
      request.cookies.get('vd_oauth_redirect_uri')?.value ??
      new URL('/api/auth/discord/callback', publicOrigin).toString();

    if (!code || !state) {
      return NextResponse.json({ error: 'Missing code/state' }, { status: 400 });
    }

    const result = await authService.exchangeCodeForSession({
      code,
      state,
      expectedState,
      redirectUri,
    });

    if (result.isErr()) {
      logger.warn(
        { code: result.error.code, statusCode: result.error.statusCode },
        'discord oauth callback failed',
      );

      const failureUrl = new URL('/dashboard', publicOrigin);
      failureUrl.searchParams.set('authError', result.error.message);
      const response = NextResponse.redirect(failureUrl);
      response.cookies.delete('vd_oauth_state');
      response.cookies.delete('vd_oauth_redirect_uri');
      return response;
    }

    const response = NextResponse.redirect(new URL('/dashboard', publicOrigin));
    response.cookies.set('vd_session', result.value.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 12,
      path: '/',
    });
    response.cookies.set('vd_discord_access_token', result.value.discordAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 12,
      path: '/',
    });
    response.cookies.delete('vd_oauth_state');
    response.cookies.delete('vd_oauth_redirect_uri');

    return response;
  } catch (error) {
    return jsonError(error);
  }
}
