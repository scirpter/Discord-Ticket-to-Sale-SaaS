import { CouponService } from '@voodoo/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError, readJson, requireSession } from '@/lib/http';

const couponService = new CouponService();

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ guildId: string; couponId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireSession(request);
    if (!auth.ok) {
      return auth.response;
    }

    const { guildId, couponId } = await context.params;
    const body = await readJson<{
      tenantId: string;
      coupon: unknown;
    }>(request);

    const result = await couponService.updateCoupon(auth.session, {
      tenantId: body.tenantId,
      guildId,
      couponId,
      coupon: body.coupon,
    });

    if (result.isErr()) {
      return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: result.error.statusCode });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ guildId: string; couponId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireSession(request);
    if (!auth.ok) {
      return auth.response;
    }

    const { guildId, couponId } = await context.params;
    const tenantId = request.nextUrl.searchParams.get('tenantId');
    if (!tenantId) {
      return NextResponse.json({ error: 'Missing tenantId query parameter' }, { status: 400 });
    }

    const result = await couponService.deleteCoupon(auth.session, {
      tenantId,
      guildId,
      couponId,
    });

    if (result.isErr()) {
      return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: result.error.statusCode });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
