import { TenantService } from '@voodoo/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError, requireSession } from '@/lib/http';

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

    const { guildId } = await context.params;
    const result = await tenantService.getLinkedTenantForGuild(auth.session, { guildId });

    if (result.isErr()) {
      return NextResponse.json({ error: result.error.message }, { status: result.error.statusCode });
    }

    return NextResponse.json({ tenantId: result.value?.tenantId ?? null });
  } catch (error) {
    return jsonError(error);
  }
}
