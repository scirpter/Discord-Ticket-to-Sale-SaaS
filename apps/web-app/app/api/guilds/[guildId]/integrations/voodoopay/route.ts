import { IntegrationService } from '@voodoo/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError, readJson, requireSession } from '@/lib/http';

const integrationService = new IntegrationService();

export async function PUT(
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
      merchantWalletAddress: string;
      checkoutDomain: string;
      callbackSecret: string;
    }>(request);

    const result = await integrationService.upsertVoodooPayConfig(auth.session, {
      tenantId: body.tenantId,
      guildId,
      payload: {
        merchantWalletAddress: body.merchantWalletAddress,
        checkoutDomain: body.checkoutDomain,
        callbackSecret: body.callbackSecret,
      },
    });

    if (result.isErr()) {
      return NextResponse.json({ error: result.error.message }, { status: result.error.statusCode });
    }

    return NextResponse.json(result.value);
  } catch (error) {
    return jsonError(error);
  }
}
