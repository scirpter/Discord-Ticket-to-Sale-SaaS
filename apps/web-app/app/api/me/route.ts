import { TenantService } from '@voodoo/core';
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError, requireSession } from '@/lib/http';

const tenantService = new TenantService();

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireSession(request);
    if (!auth.ok) {
      return auth.response;
    }

    const me = await tenantService.getMe(auth.session);
    if (me.isErr()) {
      return NextResponse.json({ error: me.error.message }, { status: me.error.statusCode });
    }

    const tenants = await tenantService.listTenants(auth.session);
    if (tenants.isErr()) {
      return NextResponse.json({ error: tenants.error.message }, { status: tenants.error.statusCode });
    }

    return NextResponse.json({
      me: me.value,
      tenants: tenants.value,
    });
  } catch (error) {
    return jsonError(error);
  }
}
