import { TenantService } from '@voodoo/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError, readJson, requireSession } from '@/lib/http';

const tenantService = new TenantService();

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

    const { guildId } = await context.params;
    const result = await tenantService.getGuildConfig(auth.session, {
      tenantId,
      guildId,
    });

    if (result.isErr()) {
      return NextResponse.json({ error: result.error.message }, { status: result.error.statusCode });
    }

    return NextResponse.json({ config: result.value });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ guildId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireSession(request);
    if (!auth.ok) {
      return auth.response;
    }

    const { guildId } = await context.params;
    const body = await readJson<{
      tenantId: string;
      paidLogChannelId: string | null;
      staffRoleIds: string[];
      defaultCurrency: string;
      tipEnabled?: boolean;
      pointsEarnCategoryKeys?: string[];
      pointsRedeemCategoryKeys?: string[];
      pointValueMinor?: number;
      ticketMetadataKey?: string;
    }>(request);

    const result = await tenantService.updateGuildConfig(auth.session, {
      tenantId: body.tenantId,
      guildId,
      paidLogChannelId: body.paidLogChannelId,
      staffRoleIds: body.staffRoleIds,
      defaultCurrency: body.defaultCurrency,
      tipEnabled: body.tipEnabled ?? false,
      pointsEarnCategoryKeys: body.pointsEarnCategoryKeys ?? [],
      pointsRedeemCategoryKeys: body.pointsRedeemCategoryKeys ?? [],
      pointValueMinor: Math.max(1, body.pointValueMinor ?? 1),
      ticketMetadataKey: body.ticketMetadataKey ?? 'isTicket',
    });

    if (result.isErr()) {
      return NextResponse.json({ error: result.error.message }, { status: result.error.statusCode });
    }

    return NextResponse.json({ config: result.value });
  } catch (error) {
    return jsonError(error);
  }
}
