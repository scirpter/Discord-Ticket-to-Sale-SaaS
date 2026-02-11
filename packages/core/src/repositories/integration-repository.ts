import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { getDb } from '../infra/db/client.js';
import { tenantIntegrationsWoo } from '../infra/db/schema/index.js';

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
}
