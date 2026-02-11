import { AdminService } from '@voodoo/core';
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError, requireSession } from '@/lib/http';

const adminService = new AdminService();

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireSession(request);
    if (!auth.ok) {
      return auth.response;
    }

    const result = await adminService.listUsers(auth.session);
    if (result.isErr()) {
      return NextResponse.json({ error: result.error.message }, { status: result.error.statusCode });
    }

    return NextResponse.json({ users: result.value });
  } catch (error) {
    return jsonError(error);
  }
}
