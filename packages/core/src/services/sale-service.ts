import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';

import { getEnv } from '../config/env.js';
import { AppError, fromUnknownError, validationError } from '../domain/errors.js';
import type { SessionPayload } from '../security/session-token.js';
import { signCheckoutToken } from '../security/checkout-token.js';
import { OrderRepository } from '../repositories/order-repository.js';
import { ProductRepository } from '../repositories/product-repository.js';
import { TenantRepository } from '../repositories/tenant-repository.js';
import { TicketMetadataRepository } from '../repositories/ticket-metadata-repository.js';
import { IntegrationService } from './integration-service.js';
import { AuthorizationService } from './authorization-service.js';

const answerSchema = z.record(z.string(), z.string().max(2000));

type SaleSessionInput = {
  tenantId: string;
  guildId: string;
  ticketChannelId: string;
  staffDiscordUserId: string;
  customerDiscordUserId: string;
  productId: string;
  variantId: string;
  answers: Record<string, string>;
};

export class SaleService {
  private readonly env = getEnv();
  private readonly orderRepository = new OrderRepository();
  private readonly productRepository = new ProductRepository();
  private readonly tenantRepository = new TenantRepository();
  private readonly integrationService = new IntegrationService();
  private readonly ticketMetadataRepository = new TicketMetadataRepository();
  private readonly authorizationService = new AuthorizationService();

  public async getSaleOptions(input: {
    tenantId: string;
    guildId: string;
  }): Promise<
    Result<
      Array<{
        productId: string;
        name: string;
        category: string;
        variants: Array<{ variantId: string; label: string; priceMinor: number; currency: string }>;
      }>,
      AppError
    >
  > {
    try {
      const products = await this.productRepository.listByGuild({
        tenantId: input.tenantId,
        guildId: input.guildId,
      });

      return ok(
        products
          .filter((product) => product.active)
          .map((product) => ({
            productId: product.id,
            name: product.name,
            category: product.category,
            variants: product.variants.map((variant) => ({
              variantId: variant.id,
              label: variant.label,
              priceMinor: variant.priceMinor,
              currency: variant.currency,
            })),
          })),
      );
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async isTicketChannel(input: {
    tenantId: string;
    guildId: string;
    channelId: string;
  }): Promise<boolean> {
    return this.ticketMetadataRepository.isTicketChannel(input);
  }

  public async setTicketChannelFlag(input: {
    tenantId: string;
    guildId: string;
    channelId: string;
    isTicket: boolean;
  }): Promise<Result<void, AppError>> {
    try {
      await this.ticketMetadataRepository.setTicketChannelFlag(input);
      return ok(undefined);
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async createSaleSession(
    actor: SessionPayload,
    input: SaleSessionInput,
  ): Promise<
    Result<
      {
        orderSessionId: string;
        checkoutUrl: string;
        expiresAt: string;
      },
      AppError
    >
  > {
    try {
      const roleCheck = await this.authorizationService.ensureTenantRole(actor, {
        tenantId: input.tenantId,
        minimumRole: 'admin',
      });
      if (roleCheck.isErr()) {
        return err(roleCheck.error);
      }

      const tenantActiveCheck = await this.authorizationService.ensureTenantIsActive(input.tenantId);
      if (tenantActiveCheck.isErr()) {
        return err(tenantActiveCheck.error);
      }

      return this.createSaleSessionInternal(input);
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async createSaleSessionFromBot(input: SaleSessionInput): Promise<
    Result<
      {
        orderSessionId: string;
        checkoutUrl: string;
        expiresAt: string;
      },
      AppError
    >
  > {
    try {
      const tenantActiveCheck = await this.authorizationService.ensureTenantIsActive(input.tenantId);
      if (tenantActiveCheck.isErr()) {
        return err(tenantActiveCheck.error);
      }

      return this.createSaleSessionInternal(input);
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  private async createSaleSessionInternal(input: SaleSessionInput): Promise<
    Result<
      {
        orderSessionId: string;
        checkoutUrl: string;
        expiresAt: string;
      },
      AppError
    >
  > {
    const parsedAnswers = answerSchema.safeParse(input.answers);
    if (!parsedAnswers.success) {
      return err(validationError(parsedAnswers.error.issues));
    }

    const product = await this.productRepository.getById({
      tenantId: input.tenantId,
      guildId: input.guildId,
      productId: input.productId,
    });
    if (!product) {
      return err(new AppError('PRODUCT_NOT_FOUND', 'Product not found', 404));
    }

    const variant = product.variants.find((item) => item.id === input.variantId);
    if (!variant) {
      return err(new AppError('VARIANT_NOT_FOUND', 'Variant not found', 404));
    }

    const integration = await this.integrationService.getResolvedWooIntegrationByGuild({
      tenantId: input.tenantId,
      guildId: input.guildId,
    });
    if (integration.isErr()) {
      return err(integration.error);
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const orderSession = await this.orderRepository.createOrderSession({
      tenantId: input.tenantId,
      guildId: input.guildId,
      ticketChannelId: input.ticketChannelId,
      staffUserId: input.staffDiscordUserId,
      customerDiscordId: input.customerDiscordUserId,
      productId: input.productId,
      variantId: input.variantId,
      answers: parsedAnswers.data,
      checkoutTokenExpiresAt: expiresAt,
    });

    const token = signCheckoutToken(
      {
        orderSessionId: orderSession.id,
        tenantId: input.tenantId,
        guildId: input.guildId,
        productId: input.productId,
        variantId: input.variantId,
        ticketChannelId: input.ticketChannelId,
        customerDiscordId: input.customerDiscordUserId,
        exp: Math.floor(expiresAt.getTime() / 1000),
      },
      this.env.CHECKOUT_SIGNING_SECRET,
    );

    const checkoutBase =
      variant.wooCheckoutPath && variant.wooCheckoutPath.length > 0
        ? new URL(variant.wooCheckoutPath, integration.value.wpBaseUrl)
        : new URL(integration.value.wpBaseUrl);

    checkoutBase.searchParams.set('vd_token', token);
    checkoutBase.searchParams.set('vd_order_session_id', orderSession.id);

    return ok({
      orderSessionId: orderSession.id,
      checkoutUrl: checkoutBase.toString(),
      expiresAt: expiresAt.toISOString(),
    });
  }

  public async cancelLatestPendingSession(input: {
    tenantId: string;
    guildId: string;
    ticketChannelId: string;
  }): Promise<Result<{ orderSessionId: string }, AppError>> {
    try {
      const existing = await this.orderRepository.getLatestPendingSessionByChannel(input);
      if (!existing) {
        return err(new AppError('ORDER_SESSION_NOT_FOUND', 'No pending session found', 404));
      }

      const cancelled = await this.orderRepository.cancelOrderSession({
        tenantId: input.tenantId,
        orderSessionId: existing.id,
      });

      if (!cancelled) {
        return err(new AppError('ORDER_SESSION_NOT_CANCELABLE', 'Order session cannot be cancelled', 409));
      }

      return ok({ orderSessionId: existing.id });
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async getGuildRuntimeConfig(input: {
    tenantId: string;
    guildId: string;
  }): Promise<
    Result<
      {
        paidLogChannelId: string | null;
        staffRoleIds: string[];
        defaultCurrency: string;
        ticketMetadataKey: string;
      },
      AppError
    >
  > {
    try {
      const config = await this.tenantRepository.getGuildConfig(input);
      if (!config) {
        return err(new AppError('GUILD_CONFIG_NOT_FOUND', 'Guild config not found', 404));
      }

      return ok({
        paidLogChannelId: config.paidLogChannelId,
        staffRoleIds: config.staffRoleIds,
        defaultCurrency: config.defaultCurrency,
        ticketMetadataKey: config.ticketMetadataKey,
      });
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }
}
