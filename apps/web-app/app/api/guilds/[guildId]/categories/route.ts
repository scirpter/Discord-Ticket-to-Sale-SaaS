import { ProductService } from '@voodoo/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError, readJson, requireSession } from '@/lib/http';

const productService = new ProductService();

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
      category: string;
      newCategory: string;
    }>(request);

    const result = await productService.renameCategory(auth.session, {
      tenantId: body.tenantId,
      guildId,
      category: body.category,
      newCategory: body.newCategory,
    });

    if (result.isErr()) {
      return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: result.error.statusCode });
    }

    return NextResponse.json({ ok: true, ...result.value });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
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
      category: string;
    }>(request);

    const result = await productService.deleteCategory(auth.session, {
      tenantId: body.tenantId,
      guildId,
      category: body.category,
    });

    if (result.isErr()) {
      return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: result.error.statusCode });
    }

    return NextResponse.json({ ok: true, ...result.value });
  } catch (error) {
    return jsonError(error);
  }
}
