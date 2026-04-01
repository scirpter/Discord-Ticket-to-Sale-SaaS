import { DEFAULT_VOODOO_PAY_CHECKOUT_DOMAIN, IntegrationService, getEnv } from '@voodoo/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError, readJson, requireSession } from '@/lib/http';

const integrationService = new IntegrationService();
const env = getEnv();

type WalletInput = {
  evm?: string | null;
  btc?: string | null;
  bitcoincash?: string | null;
  ltc?: string | null;
  doge?: string | null;
  trc20?: string | null;
  solana?: string | null;
};

type SerializableIssue = {
  path?: unknown;
  message?: unknown;
};

function normalizeWalletValue(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeWalletInput(wallets: WalletInput | undefined): {
  evm?: string;
  btc?: string;
  bitcoincash?: string;
  ltc?: string;
  doge?: string;
  trc20?: string;
  solana?: string;
} {
  return {
    evm: normalizeWalletValue(wallets?.evm),
    btc: normalizeWalletValue(wallets?.btc),
    bitcoincash: normalizeWalletValue(wallets?.bitcoincash),
    ltc: normalizeWalletValue(wallets?.ltc),
    doge: normalizeWalletValue(wallets?.doge),
    trc20: normalizeWalletValue(wallets?.trc20),
    solana: normalizeWalletValue(wallets?.solana),
  };
}

function formatIntegrationValidationError(error: {
  code?: string;
  message: string;
  details?: unknown;
}): string {
  if (error.code !== 'VALIDATION_ERROR' || !Array.isArray(error.details)) {
    return error.message;
  }

  const firstIssue = error.details.find(
    (issue): issue is SerializableIssue =>
      typeof issue === 'object' && issue !== null && 'message' in issue,
  );

  if (!firstIssue || typeof firstIssue.message !== 'string' || firstIssue.message.length === 0) {
    return error.message;
  }

  const issuePath =
    Array.isArray(firstIssue.path) && firstIssue.path.length > 0
      ? firstIssue.path.map((segment) => String(segment)).join('.')
      : '';

  return issuePath.length > 0
    ? `${issuePath}: ${firstIssue.message}`
    : firstIssue.message;
}

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
    const result = await integrationService.getResolvedVoodooPayIntegrationByGuild({
      tenantId,
      guildId,
    });

    if (result.isErr()) {
      if (result.error.statusCode === 404) {
        return NextResponse.json({ integration: null });
      }

      return NextResponse.json({ error: result.error.message }, { status: result.error.statusCode });
    }

    return NextResponse.json({
      integration: {
        merchantWalletAddress: result.value.merchantWalletAddress,
        cryptoGatewayEnabled: result.value.cryptoGatewayEnabled,
        cryptoAddFees: result.value.cryptoAddFees,
        cryptoWallets: {
          evm: result.value.cryptoWallets.evm ?? '',
          btc: result.value.cryptoWallets.btc ?? '',
          bitcoincash: result.value.cryptoWallets.bitcoincash ?? '',
          ltc: result.value.cryptoWallets.ltc ?? '',
          doge: result.value.cryptoWallets.doge ?? '',
          trc20: result.value.cryptoWallets.trc20 ?? '',
          solana: result.value.cryptoWallets.solana ?? '',
        },
        checkoutDomain: result.value.checkoutDomain,
        tenantWebhookKey: result.value.tenantWebhookKey,
        webhookUrl: `${env.BOT_PUBLIC_URL}/api/webhooks/voodoopay/${result.value.tenantWebhookKey}`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(
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
      merchantWalletAddress: string;
      checkoutDomain?: string;
      callbackSecret?: string;
      cryptoGatewayEnabled?: boolean;
      cryptoAddFees?: boolean;
      cryptoWallets?: {
        evm?: string | null;
        btc?: string | null;
        bitcoincash?: string | null;
        ltc?: string | null;
        doge?: string | null;
        trc20?: string | null;
        solana?: string | null;
      };
    }>(request);

    const existing = await integrationService.getResolvedVoodooPayIntegrationByGuild({
      tenantId: body.tenantId,
      guildId,
    });
    if (existing.isErr() && existing.error.statusCode !== 404) {
      return NextResponse.json({ error: existing.error.message }, { status: existing.error.statusCode });
    }

    const existingWallets = existing.isOk()
      ? normalizeWalletInput({
          evm: existing.value.cryptoWallets.evm ?? undefined,
          btc: existing.value.cryptoWallets.btc ?? undefined,
          bitcoincash: existing.value.cryptoWallets.bitcoincash ?? undefined,
          ltc: existing.value.cryptoWallets.ltc ?? undefined,
          doge: existing.value.cryptoWallets.doge ?? undefined,
          trc20: existing.value.cryptoWallets.trc20 ?? undefined,
          solana: existing.value.cryptoWallets.solana ?? undefined,
        })
      : {};

    const requestWallets = normalizeWalletInput(body.cryptoWallets);

    const result = await integrationService.upsertVoodooPayConfig(auth.session, {
      tenantId: body.tenantId,
      guildId,
      payload: {
        merchantWalletAddress: body.merchantWalletAddress,
        checkoutDomain: DEFAULT_VOODOO_PAY_CHECKOUT_DOMAIN,
        callbackSecret: body.callbackSecret,
        cryptoGatewayEnabled: body.cryptoGatewayEnabled ?? (existing.isOk() ? existing.value.cryptoGatewayEnabled : false),
        cryptoAddFees: body.cryptoAddFees ?? (existing.isOk() ? existing.value.cryptoAddFees : false),
        cryptoWallets: body.cryptoWallets ? requestWallets : existingWallets,
      },
    });

    if (result.isErr()) {
      return NextResponse.json(
        { error: formatIntegrationValidationError(result.error) },
        { status: result.error.statusCode },
      );
    }

    return NextResponse.json(result.value);
  } catch (error) {
    return jsonError(error);
  }
}
