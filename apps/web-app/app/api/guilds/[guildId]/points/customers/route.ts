import { PointsService } from '@voodoo/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError, requireSession } from '@/lib/http';

const pointsService = new PointsService();

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ guildId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireSession(request);
    if (!auth.ok) {
      return auth.response;
    }

    const tenantId = request.nextUrl.searchParams.get('tenantId');
    if (!tenantId) {
      return NextResponse.json({ error: 'Missing tenantId query parameter' }, { status: 400 });
    }

    const search = request.nextUrl.searchParams.get('search');
    const { guildId } = await context.params;

    const result = await pointsService.listCustomers(auth.session, {
      tenantId,
      guildId,
      search,
    });
    if (result.isErr()) {
      return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: result.error.statusCode });
    }

    return NextResponse.json({ customers: result.value });
  } catch (error) {
    return jsonError(error);
  }
}
