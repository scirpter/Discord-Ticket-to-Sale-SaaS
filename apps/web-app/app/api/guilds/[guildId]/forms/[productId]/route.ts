import { ProductService } from '@voodoo/core';
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError, readJson, requireSession } from '@/lib/http';

const productService = new ProductService();

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ guildId: string; productId: string }> },
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

    const { guildId, productId } = await context.params;
    const result = await productService.getFormFields(auth.session, {
      tenantId,
      guildId,
      productId,
    });

    if (result.isErr()) {
      return NextResponse.json({ error: result.error.message }, { status: result.error.statusCode });
    }

    return NextResponse.json({ fields: result.value });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ guildId: string; productId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireSession(request);
    if (!auth.ok) {
      return auth.response;
    }

    const { guildId, productId } = await context.params;
    const body = await readJson<{ tenantId: string; formFields: unknown }>(request);

    const result = await productService.replaceFormFields(auth.session, {
      tenantId: body.tenantId,
      guildId,
      productId,
      formFields: body.formFields,
    });

    if (result.isErr()) {
      return NextResponse.json({ error: result.error.message }, { status: result.error.statusCode });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
