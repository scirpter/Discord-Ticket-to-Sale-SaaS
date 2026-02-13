import { AuthService, getEnv } from '@voodoo/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/http';

const authService = new AuthService();
const env = getEnv();

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const expectedState = request.cookies.get('vd_oauth_state')?.value ?? '';

    if (!code || !state) {
      return NextResponse.json({ error: 'Missing code/state' }, { status: 400 });
    }

    const result = await authService.exchangeCodeForSession({
      code,
      state,
      expectedState,
    });

    if (result.isErr()) {
      return NextResponse.json({ error: result.error.message }, { status: result.error.statusCode });
    }

    const response = NextResponse.redirect(new URL('/dashboard', env.BOT_PUBLIC_URL));
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

    return response;
  } catch (error) {
    return jsonError(error);
  }
}
