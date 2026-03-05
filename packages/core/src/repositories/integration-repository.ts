import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { getDb } from '../infra/db/client.js';
import { tenantIntegrationsVoodooPay, tenantIntegrationsWoo } from '../infra/db/schema/index.js';

export type WooIntegrationRecord = {
  id: string;
  tenantId: string;
  guildId: string;
  wpBaseUrl: string;
  tenantWebhookKey: string;
  webhookSecretEncrypted: string;
  consumerKeyEncrypted: string;
  consumerSecretEncrypted: string;
};

export type VoodooPayIntegrationRecord = {
  id: string;
  tenantId: string;
  guildId: string;
  merchantWalletAddress: string;
  cryptoGatewayEnabled: boolean;
  cryptoAddFees: boolean;
  cryptoWallets: {
    evm: string | null;
    btc: string | null;
    bitcoincash: string | null;
    ltc: string | null;
    doge: string | null;
    trc20: string | null;
    solana: string | null;
  };
  checkoutDomain: string;
  tenantWebhookKey: string;
  callbackSecretEncrypted: string;
};

export class IntegrationRepository {
  private readonly db = getDb();

  public async upsertWooIntegration(input: {
    tenantId: string;
    guildId: string;
    wpBaseUrl: string;
    tenantWebhookKey: string;
    webhookSecretEncrypted: string;
    consumerKeyEncrypted: string;
    consumerSecretEncrypted: string;
  }): Promise<WooIntegrationRecord> {
    const existing = await this.db.query.tenantIntegrationsWoo.findFirst({
      where: and(
        eq(tenantIntegrationsWoo.tenantId, input.tenantId),
        eq(tenantIntegrationsWoo.guildId, input.guildId),
      ),
    });

    if (existing) {
      await this.db
        .update(tenantIntegrationsWoo)
        .set({
          wpBaseUrl: input.wpBaseUrl,
          tenantWebhookKey: input.tenantWebhookKey,
          webhookSecretEncrypted: input.webhookSecretEncrypted,
          consumerKeyEncrypted: input.consumerKeyEncrypted,
          consumerSecretEncrypted: input.consumerSecretEncrypted,
          updatedAt: new Date(),
        })
        .where(eq(tenantIntegrationsWoo.id, existing.id));

      return {
        id: existing.id,
        tenantId: input.tenantId,
        guildId: input.guildId,
        wpBaseUrl: input.wpBaseUrl,
        tenantWebhookKey: input.tenantWebhookKey,
        webhookSecretEncrypted: input.webhookSecretEncrypted,
        consumerKeyEncrypted: input.consumerKeyEncrypted,
        consumerSecretEncrypted: input.consumerSecretEncrypted,
      };
    }

    const id = ulid();
    await this.db.insert(tenantIntegrationsWoo).values({
      id,
      tenantId: input.tenantId,
      guildId: input.guildId,
      wpBaseUrl: input.wpBaseUrl,
      tenantWebhookKey: input.tenantWebhookKey,
      webhookSecretEncrypted: input.webhookSecretEncrypted,
      consumerKeyEncrypted: input.consumerKeyEncrypted,
      consumerSecretEncrypted: input.consumerSecretEncrypted,
    });

    return {
      id,
      tenantId: input.tenantId,
      guildId: input.guildId,
      wpBaseUrl: input.wpBaseUrl,
      tenantWebhookKey: input.tenantWebhookKey,
      webhookSecretEncrypted: input.webhookSecretEncrypted,
      consumerKeyEncrypted: input.consumerKeyEncrypted,
      consumerSecretEncrypted: input.consumerSecretEncrypted,
    };
  }

  public async getWooIntegrationByGuild(input: {
    tenantId: string;
    guildId: string;
  }): Promise<WooIntegrationRecord | null> {
    const row = await this.db.query.tenantIntegrationsWoo.findFirst({
      where: and(
        eq(tenantIntegrationsWoo.tenantId, input.tenantId),
        eq(tenantIntegrationsWoo.guildId, input.guildId),
      ),
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      tenantId: row.tenantId,
      guildId: row.guildId,
      wpBaseUrl: row.wpBaseUrl,
      tenantWebhookKey: row.tenantWebhookKey,
      webhookSecretEncrypted: row.webhookSecretEncrypted,
      consumerKeyEncrypted: row.consumerKeyEncrypted,
      consumerSecretEncrypted: row.consumerSecretEncrypted,
    };
  }

  public async getWooIntegrationByWebhookKey(
    tenantWebhookKey: string,
  ): Promise<WooIntegrationRecord | null> {
    const row = await this.db.query.tenantIntegrationsWoo.findFirst({
      where: eq(tenantIntegrationsWoo.tenantWebhookKey, tenantWebhookKey),
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      tenantId: row.tenantId,
      guildId: row.guildId,
      wpBaseUrl: row.wpBaseUrl,
      tenantWebhookKey: row.tenantWebhookKey,
      webhookSecretEncrypted: row.webhookSecretEncrypted,
      consumerKeyEncrypted: row.consumerKeyEncrypted,
      consumerSecretEncrypted: row.consumerSecretEncrypted,
    };
  }

  public async upsertVoodooPayIntegration(input: {
    tenantId: string;
    guildId: string;
    merchantWalletAddress: string;
    cryptoGatewayEnabled: boolean;
    cryptoAddFees: boolean;
    cryptoWallets: {
      evm?: string | null;
      btc?: string | null;
      bitcoincash?: string | null;
      ltc?: string | null;
      doge?: string | null;
      trc20?: string | null;
      solana?: string | null;
    };
    checkoutDomain: string;
    tenantWebhookKey: string;
    callbackSecretEncrypted: string;
  }): Promise<VoodooPayIntegrationRecord> {
    const existing = await this.db.query.tenantIntegrationsVoodooPay.findFirst({
      where: and(
        eq(tenantIntegrationsVoodooPay.tenantId, input.tenantId),
        eq(tenantIntegrationsVoodooPay.guildId, input.guildId),
      ),
    });

    if (existing) {
      await this.db
        .update(tenantIntegrationsVoodooPay)
        .set({
          merchantWalletAddress: input.merchantWalletAddress,
          cryptoGatewayEnabled: input.cryptoGatewayEnabled,
          cryptoAddFees: input.cryptoAddFees,
          cryptoWalletEvm: input.cryptoWallets.evm ?? null,
          cryptoWalletBtc: input.cryptoWallets.btc ?? null,
          cryptoWalletBitcoincash: input.cryptoWallets.bitcoincash ?? null,
          cryptoWalletLtc: input.cryptoWallets.ltc ?? null,
          cryptoWalletDoge: input.cryptoWallets.doge ?? null,
          cryptoWalletTrc20: input.cryptoWallets.trc20 ?? null,
          cryptoWalletSolana: input.cryptoWallets.solana ?? null,
          checkoutDomain: input.checkoutDomain,
          tenantWebhookKey: input.tenantWebhookKey,
          callbackSecretEncrypted: input.callbackSecretEncrypted,
          updatedAt: new Date(),
        })
        .where(eq(tenantIntegrationsVoodooPay.id, existing.id));

      return {
        id: existing.id,
        tenantId: input.tenantId,
        guildId: input.guildId,
        merchantWalletAddress: input.merchantWalletAddress,
        cryptoGatewayEnabled: input.cryptoGatewayEnabled,
        cryptoAddFees: input.cryptoAddFees,
        cryptoWallets: {
          evm: input.cryptoWallets.evm ?? null,
          btc: input.cryptoWallets.btc ?? null,
          bitcoincash: input.cryptoWallets.bitcoincash ?? null,
          ltc: input.cryptoWallets.ltc ?? null,
          doge: input.cryptoWallets.doge ?? null,
          trc20: input.cryptoWallets.trc20 ?? null,
          solana: input.cryptoWallets.solana ?? null,
        },
        checkoutDomain: input.checkoutDomain,
        tenantWebhookKey: input.tenantWebhookKey,
        callbackSecretEncrypted: input.callbackSecretEncrypted,
      };
    }

    const id = ulid();
    await this.db.insert(tenantIntegrationsVoodooPay).values({
      id,
      tenantId: input.tenantId,
      guildId: input.guildId,
      merchantWalletAddress: input.merchantWalletAddress,
      cryptoGatewayEnabled: input.cryptoGatewayEnabled,
      cryptoAddFees: input.cryptoAddFees,
      cryptoWalletEvm: input.cryptoWallets.evm ?? null,
      cryptoWalletBtc: input.cryptoWallets.btc ?? null,
      cryptoWalletBitcoincash: input.cryptoWallets.bitcoincash ?? null,
      cryptoWalletLtc: input.cryptoWallets.ltc ?? null,
      cryptoWalletDoge: input.cryptoWallets.doge ?? null,
      cryptoWalletTrc20: input.cryptoWallets.trc20 ?? null,
      cryptoWalletSolana: input.cryptoWallets.solana ?? null,
      checkoutDomain: input.checkoutDomain,
      tenantWebhookKey: input.tenantWebhookKey,
      callbackSecretEncrypted: input.callbackSecretEncrypted,
    });

    return {
      id,
      tenantId: input.tenantId,
      guildId: input.guildId,
      merchantWalletAddress: input.merchantWalletAddress,
      cryptoGatewayEnabled: input.cryptoGatewayEnabled,
      cryptoAddFees: input.cryptoAddFees,
      cryptoWallets: {
        evm: input.cryptoWallets.evm ?? null,
        btc: input.cryptoWallets.btc ?? null,
        bitcoincash: input.cryptoWallets.bitcoincash ?? null,
        ltc: input.cryptoWallets.ltc ?? null,
        doge: input.cryptoWallets.doge ?? null,
        trc20: input.cryptoWallets.trc20 ?? null,
        solana: input.cryptoWallets.solana ?? null,
      },
      checkoutDomain: input.checkoutDomain,
      tenantWebhookKey: input.tenantWebhookKey,
      callbackSecretEncrypted: input.callbackSecretEncrypted,
    };
  }

  public async getVoodooPayIntegrationByGuild(input: {
    tenantId: string;
    guildId: string;
  }): Promise<VoodooPayIntegrationRecord | null> {
    const row = await this.db.query.tenantIntegrationsVoodooPay.findFirst({
      where: and(
        eq(tenantIntegrationsVoodooPay.tenantId, input.tenantId),
        eq(tenantIntegrationsVoodooPay.guildId, input.guildId),
      ),
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      tenantId: row.tenantId,
      guildId: row.guildId,
      merchantWalletAddress: row.merchantWalletAddress,
      cryptoGatewayEnabled: row.cryptoGatewayEnabled,
      cryptoAddFees: row.cryptoAddFees,
      cryptoWallets: {
        evm: row.cryptoWalletEvm,
        btc: row.cryptoWalletBtc,
        bitcoincash: row.cryptoWalletBitcoincash,
        ltc: row.cryptoWalletLtc,
        doge: row.cryptoWalletDoge,
        trc20: row.cryptoWalletTrc20,
        solana: row.cryptoWalletSolana,
      },
      checkoutDomain: row.checkoutDomain,
      tenantWebhookKey: row.tenantWebhookKey,
      callbackSecretEncrypted: row.callbackSecretEncrypted,
    };
  }

  public async getVoodooPayIntegrationByWebhookKey(
    tenantWebhookKey: string,
  ): Promise<VoodooPayIntegrationRecord | null> {
    const row = await this.db.query.tenantIntegrationsVoodooPay.findFirst({
      where: eq(tenantIntegrationsVoodooPay.tenantWebhookKey, tenantWebhookKey),
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      tenantId: row.tenantId,
      guildId: row.guildId,
      merchantWalletAddress: row.merchantWalletAddress,
      cryptoGatewayEnabled: row.cryptoGatewayEnabled,
      cryptoAddFees: row.cryptoAddFees,
      cryptoWallets: {
        evm: row.cryptoWalletEvm,
        btc: row.cryptoWalletBtc,
        bitcoincash: row.cryptoWalletBitcoincash,
        ltc: row.cryptoWalletLtc,
        doge: row.cryptoWalletDoge,
        trc20: row.cryptoWalletTrc20,
        solana: row.cryptoWalletSolana,
      },
      checkoutDomain: row.checkoutDomain,
      tenantWebhookKey: row.tenantWebhookKey,
      callbackSecretEncrypted: row.callbackSecretEncrypted,
    };
  }
}
