import crypto from 'node:crypto';

import { AuthService } from '@voodoo/core';
import { NextResponse } from 'next/server';

const authService = new AuthService();

export async function GET(): Promise<NextResponse> {
  const state = crypto.randomUUID();
  const loginUrl = authService.buildLoginUrl(state);

  const response = NextResponse.redirect(loginUrl);
  response.cookies.set('vd_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60,
    path: '/',
  });

  return response;
}
