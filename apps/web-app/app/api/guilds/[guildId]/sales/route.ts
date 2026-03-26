import {
  DashboardService,
  type DashboardSaleFilterRange,
} from '@voodoo/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError, requireSession } from '@/lib/http';

const dashboardService = new DashboardService();
const SALES_RANGES: DashboardSaleFilterRange[] = ['all', 'day', 'week', 'month', 'custom'];

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

    const rawRange = request.nextUrl.searchParams.get('range');
    const range =
      rawRange && SALES_RANGES.includes(rawRange as DashboardSaleFilterRange)
        ? (rawRange as DashboardSaleFilterRange)
        : 'all';
    const timeZone = request.nextUrl.searchParams.get('timeZone');
    const fromDate = request.nextUrl.searchParams.get('fromDate');
    const toDate = request.nextUrl.searchParams.get('toDate');
    const search = request.nextUrl.searchParams.get('search');
    const { guildId } = await context.params;
    const result = await dashboardService.listGuildSales(auth.session, {
      tenantId,
      guildId,
      timeZone,
      range,
      fromDate,
      toDate,
      search,
    });

    if (result.isErr()) {
      return NextResponse.json(
        { error: result.error.message, code: result.error.code },
        { status: result.error.statusCode },
      );
    }

    return NextResponse.json({ sales: result.value });
  } catch (error) {
    return jsonError(error);
  }
}
