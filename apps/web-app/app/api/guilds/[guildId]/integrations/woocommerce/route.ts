import { IntegrationService } from '@voodoo/core';
import type { NextRequest} from 'next/server';
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
      wpBaseUrl: string;
      webhookSecret: string;
      consumerKey: string;
      consumerSecret: string;
    }>(request);

    const result = await integrationService.upsertWooConfig(auth.session, {
      tenantId: body.tenantId,
      guildId,
      payload: {
        wpBaseUrl: body.wpBaseUrl,
        webhookSecret: body.webhookSecret,
        consumerKey: body.consumerKey,
        consumerSecret: body.consumerSecret,
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
