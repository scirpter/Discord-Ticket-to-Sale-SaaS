import { WebhookService, logger } from '@voodoo/core';
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

function withPathFallback(
  payload: Record<string, string>,
  params: { orderSessionId: string; cbToken: string },
): Record<string, string> {
  return {
    ...payload,
    order_session_id: payload.order_session_id ?? params.orderSessionId,
    cb_token: payload.cb_token ?? params.cbToken,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantWebhookKey: string; orderSessionId: string; cbToken: string }> },
): Promise<NextResponse> {
  try {
    const { tenantWebhookKey, orderSessionId, cbToken } = await context.params;
    const query = withPathFallback(queryToObject(request), { orderSessionId, cbToken });

    logger.info(
      {
        provider: 'voodoopay',
        method: 'GET',
        route: 'webhook-path',
        queryKeys: Object.keys(query),
      },
      'voodoo callback (path) received',
    );

    const result = await webhookService.handleVoodooPayCallback({
      tenantWebhookKey,
      query,
    });

    if (result.isErr()) {
      logger.warn(
        {
          provider: 'voodoopay',
          method: 'GET',
          route: 'webhook-path',
          errorCode: result.error.code,
          statusCode: result.error.statusCode,
          message: result.error.message,
        },
        'voodoo callback (path) rejected',
      );
      return NextResponse.json({ error: result.error.message }, { status: result.error.statusCode });
    }

    logger.info(
      { provider: 'voodoopay', method: 'GET', route: 'webhook-path', status: result.value.status },
      'voodoo callback (path) accepted',
    );
    return NextResponse.json(result.value, { status: 202 });
  } catch (error) {
    logger.error(
      { provider: 'voodoopay', method: 'GET', route: 'webhook-path', err: error },
      'voodoo callback (path) failed',
    );
    return jsonError(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantWebhookKey: string; orderSessionId: string; cbToken: string }> },
): Promise<NextResponse> {
  try {
    const { tenantWebhookKey, orderSessionId, cbToken } = await context.params;
    const query = queryToObject(request);
    const body = await bodyToObject(request);
    const merged = withPathFallback(
      {
        ...body,
        ...query,
      },
      { orderSessionId, cbToken },
    );

    logger.info(
      {
        provider: 'voodoopay',
        method: 'POST',
        route: 'webhook-path',
        queryKeys: Object.keys(query),
        bodyKeys: Object.keys(body),
      },
      'voodoo callback (path) received',
    );

    const result = await webhookService.handleVoodooPayCallback({
      tenantWebhookKey,
      query: merged,
    });

    if (result.isErr()) {
      logger.warn(
        {
          provider: 'voodoopay',
          method: 'POST',
          route: 'webhook-path',
          errorCode: result.error.code,
          statusCode: result.error.statusCode,
          message: result.error.message,
        },
        'voodoo callback (path) rejected',
      );
      return NextResponse.json({ error: result.error.message }, { status: result.error.statusCode });
    }

    logger.info(
      { provider: 'voodoopay', method: 'POST', route: 'webhook-path', status: result.value.status },
      'voodoo callback (path) accepted',
    );
    return NextResponse.json(result.value, { status: 202 });
  } catch (error) {
    logger.error(
      { provider: 'voodoopay', method: 'POST', route: 'webhook-path', err: error },
      'voodoo callback (path) failed',
    );
    return jsonError(error);
  }
}
