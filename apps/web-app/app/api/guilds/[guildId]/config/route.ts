import { TenantService } from '@voodoo/core';
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError, readJson, requireSession } from '@/lib/http';

const tenantService = new TenantService();

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
      ticketMetadataKey: string;
    }>(request);

    const result = await tenantService.updateGuildConfig(auth.session, {
      tenantId: body.tenantId,
      guildId,
      paidLogChannelId: body.paidLogChannelId,
      staffRoleIds: body.staffRoleIds,
      defaultCurrency: body.defaultCurrency,
      ticketMetadataKey: body.ticketMetadataKey,
    });

    if (result.isErr()) {
      return NextResponse.json({ error: result.error.message }, { status: result.error.statusCode });
    }

    return NextResponse.json({ config: result.value });
  } catch (error) {
    return jsonError(error);
  }
}
