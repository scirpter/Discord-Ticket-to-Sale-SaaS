import { WebhookService } from '@voodoo/core';
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/http';

const webhookService = new WebhookService();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantWebhookKey: string }> },
): Promise<NextResponse> {
  try {
    const { tenantWebhookKey } = await context.params;
    const rawBody = await request.text();

    const result = await webhookService.handleWooWebhook({
      tenantWebhookKey,
      rawBody,
      signatureHeader: request.headers.get('X-WC-Webhook-Signature'),
      topicHeader: request.headers.get('X-WC-Webhook-Topic'),
      deliveryIdHeader: request.headers.get('X-WC-Webhook-Delivery-ID'),
    });

    if (result.isErr()) {
      return NextResponse.json({ error: result.error.message }, { status: result.error.statusCode });
    }

    return NextResponse.json(result.value, { status: 202 });
  } catch (error) {
    return jsonError(error);
  }
}
