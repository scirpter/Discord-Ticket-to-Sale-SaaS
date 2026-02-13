import crypto from 'node:crypto';

import { AuthService } from '@voodoo/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { resolvePublicOrigin } from '@/lib/public-origin';

const authService = new AuthService();

export async function GET(request: NextRequest): Promise<NextResponse> {
  const state = crypto.randomUUID();
  const publicOrigin = resolvePublicOrigin(request);
  const redirectUri = new URL('/api/auth/discord/callback', publicOrigin).toString();
  const loginUrl = authService.buildLoginUrl(state, redirectUri);

  const response = NextResponse.redirect(loginUrl);
  response.cookies.set('vd_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60,
    path: '/',
  });
  response.cookies.set('vd_oauth_redirect_uri', redirectUri, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60,
    path: '/',
  });

  return response;
}

