import { WebhookService } from '@voodoo/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/http';

const webhookService = new WebhookService();

function queryToObject(request: NextRequest): Record<string, string> {
  const entries = [...request.nextUrl.searchParams.entries()];
  const query: Record<string, string> = {};

  for (const [key, value] of entries) {
    query[key] = value;
  }

  return query;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantWebhookKey: string }> },
): Promise<NextResponse> {
  try {
    const { tenantWebhookKey } = await context.params;

    const result = await webhookService.handleVoodooPayCallback({
      tenantWebhookKey,
      query: queryToObject(request),
    });

    if (result.isErr()) {
      return NextResponse.json({ error: result.error.message }, { status: result.error.statusCode });
    }

    return NextResponse.json(result.value, { status: 202 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantWebhookKey: string }> },
): Promise<NextResponse> {
  return GET(request, context);
}
