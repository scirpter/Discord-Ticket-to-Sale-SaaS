import { AppError, OrderRepository, getEnv, verifyCheckoutToken } from '@voodoo/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const env = getEnv();
const orderRepository = new OrderRepository();

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderSessionId: string }> },
): Promise<NextResponse> {
  try {
    const { orderSessionId } = await context.params;
    const token = request.nextUrl.searchParams.get('t') ?? request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const payload = verifyCheckoutToken(token, env.CHECKOUT_SIGNING_SECRET);
    if (payload.orderSessionId !== orderSessionId) {
      return NextResponse.json({ error: 'Token/session mismatch' }, { status: 401 });
    }

    const session = await orderRepository.getOrderSessionById(orderSessionId);
    if (!session) {
      return NextResponse.json({ error: 'Order session not found' }, { status: 404 });
    }

    if (session.status !== 'pending_payment') {
      return NextResponse.json({ error: `Order session is ${session.status}` }, { status: 409 });
    }

    if (!session.checkoutUrl) {
      return NextResponse.json({ error: 'Checkout URL unavailable for this session' }, { status: 404 });
    }

    return NextResponse.redirect(session.checkoutUrl);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
