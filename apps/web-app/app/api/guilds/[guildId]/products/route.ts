import { ProductService } from '@voodoo/core';
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError, readJson, requireSession } from '@/lib/http';

const productService = new ProductService();

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ guildId: string }> },
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

    const { guildId } = await context.params;
    const result = await productService.listProducts(auth.session, {
      tenantId,
      guildId,
    });

    if (result.isErr()) {
      return NextResponse.json({ error: result.error.message }, { status: result.error.statusCode });
    }

    return NextResponse.json({ products: result.value });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
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
      product: unknown;
      formFields: unknown;
    }>(request);

    const result = await productService.createProduct(auth.session, {
      tenantId: body.tenantId,
      guildId,
      product: body.product,
      formFields: body.formFields,
    });

    if (result.isErr()) {
      return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: result.error.statusCode });
    }

    return NextResponse.json({ product: result.value }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
