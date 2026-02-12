import { err, ok, type Result } from 'neverthrow';
import { ulid } from 'ulid';
import { z } from 'zod';

import { getEnv } from '../config/env.js';
import { AppError, fromUnknownError, validationError } from '../domain/errors.js';
import { decryptSecret, encryptSecret } from '../security/encryption.js';
import type { SessionPayload } from '../security/session-token.js';
import { IntegrationRepository } from '../repositories/integration-repository.js';
import { AuthorizationService } from './authorization-service.js';

const integrationInputSchema = z.object({
  wpBaseUrl: z.string().url(),
  webhookSecret: z.string().min(8).max(255),
  consumerKey: z.string().min(8).max(255),
  consumerSecret: z.string().min(8).max(255),
});

const voodooIntegrationInputSchema = z.object({
  merchantWalletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'merchantWalletAddress must be a valid Polygon wallet address'),
  checkoutDomain: z.string().min(1).max(120).default('checkout.voodoo-pay.uk'),
  callbackSecret: z.string().min(16).max(255),
});

export type WooIntegrationResolved = {
  tenantId: string;
  guildId: string;
  wpBaseUrl: string;
  tenantWebhookKey: string;
  webhookSecret: string;
  consumerKey: string;
  consumerSecret: string;
};

export type VoodooPayIntegrationResolved = {
  tenantId: string;
  guildId: string;
  merchantWalletAddress: string;
  checkoutDomain: string;
  tenantWebhookKey: string;
  callbackSecret: string;
};

export class IntegrationService {
  private readonly env = getEnv();
  private readonly integrationRepository = new IntegrationRepository();
  private readonly authorizationService = new AuthorizationService();

  public async upsertWooConfig(
    actor: SessionPayload,
    input: {
      tenantId: string;
      guildId: string;
      payload: unknown;
    },
  ): Promise<Result<{ webhookUrl: string; tenantWebhookKey: string }, AppError>> {
    try {
      const roleCheck = await this.authorizationService.ensureTenantRole(actor, {
        tenantId: input.tenantId,
        minimumRole: 'admin',
      });
      if (roleCheck.isErr()) {
        return err(roleCheck.error);
      }

      const parsed = integrationInputSchema.safeParse(input.payload);
      if (!parsed.success) {
        return err(validationError(parsed.error.issues));
      }

      const webhookKey = ulid().toLowerCase();
      const config = parsed.data;

      await this.integrationRepository.upsertWooIntegration({
        tenantId: input.tenantId,
        guildId: input.guildId,
        wpBaseUrl: config.wpBaseUrl,
        tenantWebhookKey: webhookKey,
        webhookSecretEncrypted: encryptSecret(config.webhookSecret, this.env.ENCRYPTION_KEY),
        consumerKeyEncrypted: encryptSecret(config.consumerKey, this.env.ENCRYPTION_KEY),
        consumerSecretEncrypted: encryptSecret(config.consumerSecret, this.env.ENCRYPTION_KEY),
      });

      return ok({
        webhookUrl: `${this.env.BOT_PUBLIC_URL}/api/webhooks/woocommerce/${webhookKey}`,
        tenantWebhookKey: webhookKey,
      });
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async upsertVoodooPayConfig(
    actor: SessionPayload,
    input: {
      tenantId: string;
      guildId: string;
      payload: unknown;
    },
  ): Promise<Result<{ webhookUrl: string; tenantWebhookKey: string }, AppError>> {
    try {
      const roleCheck = await this.authorizationService.ensureTenantRole(actor, {
        tenantId: input.tenantId,
        minimumRole: 'admin',
      });
      if (roleCheck.isErr()) {
        return err(roleCheck.error);
      }

      const parsed = voodooIntegrationInputSchema.safeParse(input.payload);
      if (!parsed.success) {
        return err(validationError(parsed.error.issues));
      }

      const webhookKey = ulid().toLowerCase();
      const config = parsed.data;

      await this.integrationRepository.upsertVoodooPayIntegration({
        tenantId: input.tenantId,
        guildId: input.guildId,
        merchantWalletAddress: config.merchantWalletAddress,
        checkoutDomain: config.checkoutDomain,
        tenantWebhookKey: webhookKey,
        callbackSecretEncrypted: encryptSecret(config.callbackSecret, this.env.ENCRYPTION_KEY),
      });

      return ok({
        webhookUrl: `${this.env.BOT_PUBLIC_URL}/api/webhooks/voodoopay/${webhookKey}`,
        tenantWebhookKey: webhookKey,
      });
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async getResolvedWooIntegrationByGuild(input: {
    tenantId: string;
    guildId: string;
  }): Promise<Result<WooIntegrationResolved, AppError>> {
    try {
      const row = await this.integrationRepository.getWooIntegrationByGuild(input);
      if (!row) {
        return err(new AppError('WOO_INTEGRATION_NOT_CONFIGURED', 'Woo integration is not configured', 404));
      }

      return ok({
        tenantId: row.tenantId,
        guildId: row.guildId,
        wpBaseUrl: row.wpBaseUrl,
        tenantWebhookKey: row.tenantWebhookKey,
        webhookSecret: decryptSecret(row.webhookSecretEncrypted, this.env.ENCRYPTION_KEY),
        consumerKey: decryptSecret(row.consumerKeyEncrypted, this.env.ENCRYPTION_KEY),
        consumerSecret: decryptSecret(row.consumerSecretEncrypted, this.env.ENCRYPTION_KEY),
      });
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async getResolvedVoodooPayIntegrationByGuild(input: {
    tenantId: string;
    guildId: string;
  }): Promise<Result<VoodooPayIntegrationResolved, AppError>> {
    try {
      const row = await this.integrationRepository.getVoodooPayIntegrationByGuild(input);
      if (!row) {
        return err(
          new AppError('VOODOO_PAY_INTEGRATION_NOT_CONFIGURED', 'Voodoo Pay integration is not configured', 404),
        );
      }

      return ok({
        tenantId: row.tenantId,
        guildId: row.guildId,
        merchantWalletAddress: row.merchantWalletAddress,
        checkoutDomain: row.checkoutDomain,
        tenantWebhookKey: row.tenantWebhookKey,
        callbackSecret: decryptSecret(row.callbackSecretEncrypted, this.env.ENCRYPTION_KEY),
      });
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async getResolvedWooIntegrationByWebhookKey(
    tenantWebhookKey: string,
  ): Promise<Result<WooIntegrationResolved, AppError>> {
    try {
      const row = await this.integrationRepository.getWooIntegrationByWebhookKey(tenantWebhookKey);
      if (!row) {
        return err(new AppError('WOO_INTEGRATION_NOT_FOUND', 'Woo integration not found', 404));
      }

      return ok({
        tenantId: row.tenantId,
        guildId: row.guildId,
        wpBaseUrl: row.wpBaseUrl,
        tenantWebhookKey: row.tenantWebhookKey,
        webhookSecret: decryptSecret(row.webhookSecretEncrypted, this.env.ENCRYPTION_KEY),
        consumerKey: decryptSecret(row.consumerKeyEncrypted, this.env.ENCRYPTION_KEY),
        consumerSecret: decryptSecret(row.consumerSecretEncrypted, this.env.ENCRYPTION_KEY),
      });
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async getResolvedVoodooPayIntegrationByWebhookKey(
    tenantWebhookKey: string,
  ): Promise<Result<VoodooPayIntegrationResolved, AppError>> {
    try {
      const row = await this.integrationRepository.getVoodooPayIntegrationByWebhookKey(tenantWebhookKey);
      if (!row) {
        return err(new AppError('VOODOO_PAY_INTEGRATION_NOT_FOUND', 'Voodoo Pay integration not found', 404));
      }

      return ok({
        tenantId: row.tenantId,
        guildId: row.guildId,
        merchantWalletAddress: row.merchantWalletAddress,
        checkoutDomain: row.checkoutDomain,
        tenantWebhookKey: row.tenantWebhookKey,
        callbackSecret: decryptSecret(row.callbackSecretEncrypted, this.env.ENCRYPTION_KEY),
      });
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }
}
