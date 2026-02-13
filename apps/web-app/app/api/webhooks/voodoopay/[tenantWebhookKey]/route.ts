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

function toScalar(value: FormDataEntryValue): string {
  if (typeof value === 'string') {
    return value;
  }

  return value.name;
}

async function bodyToObject(request: NextRequest): Promise<Record<string, string>> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType) {
    return {};
  }

  if (contentType.includes('application/json')) {
    const payload = (await request.json()) as Record<string, unknown>;
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(payload)) {
      if (value === null || value === undefined) {
        continue;
      }
      result[key] = String(value);
    }

    return result;
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const formData = await request.formData();
    const result: Record<string, string> = {};

    for (const [key, value] of formData.entries()) {
      result[key] = toScalar(value);
    }

    return result;
  }

  return {};
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
  try {
    const { tenantWebhookKey } = await context.params;
    const query = queryToObject(request);
    const body = await bodyToObject(request);

    const result = await webhookService.handleVoodooPayCallback({
      tenantWebhookKey,
      query: {
        ...body,
        ...query,
      },
    });

    if (result.isErr()) {
      return NextResponse.json({ error: result.error.message }, { status: result.error.statusCode });
    }

    return NextResponse.json(result.value, { status: 202 });
  } catch (error) {
    return jsonError(error);
  }
}
