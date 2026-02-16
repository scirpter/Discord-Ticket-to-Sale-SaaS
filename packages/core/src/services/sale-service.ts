import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';

import { getEnv } from '../config/env.js';
import { AppError, fromUnknownError, validationError } from '../domain/errors.js';
import type { SessionPayload } from '../security/session-token.js';
import { signCheckoutToken } from '../security/checkout-token.js';
import { signVoodooCallbackToken } from '../security/voodoo-callback-token.js';
import { CouponRepository } from '../repositories/coupon-repository.js';
import { OrderRepository } from '../repositories/order-repository.js';
import { ProductRepository } from '../repositories/product-repository.js';
import { TenantRepository } from '../repositories/tenant-repository.js';
import { TicketMetadataRepository } from '../repositories/ticket-metadata-repository.js';
import { AuthorizationService } from './authorization-service.js';
import { IntegrationService } from './integration-service.js';

const answerSchema = z.record(z.string(), z.string().max(2000));
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FALLBACK_EMAIL_DOMAIN = 'voodoopaybot.online';

type SaleSessionInput = {
  tenantId: string;
  guildId: string;
  ticketChannelId: string;
  staffDiscordUserId: string;
  customerDiscordUserId: string;
  productId: string;
  variantId: string;
  items?: Array<{
    productId: string;
    variantId: string;
  }>;
  couponCode?: string | null;
  tipMinor?: number;
  answers: Record<string, string>;
};

type ResolvedSaleItem = {
  productId: string;
  productName: string;
  category: string;
  variantId: string;
  variantLabel: string;
  priceMinor: number;
  currency: string;
};

export class SaleService {
  private readonly env = getEnv();
  private readonly couponRepository = new CouponRepository();
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
        description: string;
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
            description: product.description,
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

    const requestedItems =
      input.items && input.items.length > 0
        ? input.items
        : [
            {
              productId: input.productId,
              variantId: input.variantId,
            },
          ];

    const resolvedItemsResult = await this.resolveSaleItems({
      tenantId: input.tenantId,
      guildId: input.guildId,
      requestedItems,
    });
    if (resolvedItemsResult.isErr()) {
      return err(resolvedItemsResult.error);
    }
    const resolvedItems = resolvedItemsResult.value;
    const primaryItem = resolvedItems[0];
    if (!primaryItem) {
      return err(new AppError('BASKET_EMPTY', 'Basket must include at least one item', 400));
    }

    const subtotalMinor = resolvedItems.reduce((sum, item) => sum + item.priceMinor, 0);
    const normalizedCouponCode = input.couponCode?.trim().toUpperCase() ?? null;
    let couponDiscountMinor = 0;
    if (normalizedCouponCode) {
      const coupon = await this.couponRepository.getByCode({
        tenantId: input.tenantId,
        guildId: input.guildId,
        code: normalizedCouponCode,
      });
      if (!coupon || !coupon.active) {
        return err(new AppError('COUPON_NOT_FOUND', 'Coupon code is invalid or inactive', 404));
      }

      couponDiscountMinor = Math.min(subtotalMinor, coupon.discountMinor);
    }

    const tipMinorRaw = input.tipMinor ?? 0;
    if (!Number.isInteger(tipMinorRaw) || tipMinorRaw < 0) {
      return err(new AppError('TIP_INVALID', 'Tip amount must be a non-negative integer minor amount', 400));
    }

    const totalMinor = Math.max(0, subtotalMinor - couponDiscountMinor + tipMinorRaw);

    const voodooIntegration = await this.integrationService.getResolvedVoodooPayIntegrationByGuild({
      tenantId: input.tenantId,
      guildId: input.guildId,
    });
    const wooIntegration = await this.integrationService.getResolvedWooIntegrationByGuild({
      tenantId: input.tenantId,
      guildId: input.guildId,
    });

    if (voodooIntegration.isErr() && wooIntegration.isErr()) {
      return err(
        new AppError(
          'PAYMENT_INTEGRATION_NOT_CONFIGURED',
          'No payment integration configured for this guild',
          404,
        ),
      );
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const orderSession = await this.orderRepository.createOrderSession({
      tenantId: input.tenantId,
      guildId: input.guildId,
      ticketChannelId: input.ticketChannelId,
      staffUserId: input.staffDiscordUserId,
      customerDiscordId: input.customerDiscordUserId,
      productId: primaryItem.productId,
      variantId: primaryItem.variantId,
      basketItems: resolvedItems,
      couponCode: normalizedCouponCode,
      couponDiscountMinor,
      tipMinor: tipMinorRaw,
      subtotalMinor,
      totalMinor,
      answers: parsedAnswers.data,
      checkoutTokenExpiresAt: expiresAt,
    });

    const token = signCheckoutToken(
      {
        orderSessionId: orderSession.id,
        exp: Math.floor(expiresAt.getTime() / 1000),
      },
      this.env.CHECKOUT_SIGNING_SECRET,
    );

    if (voodooIntegration.isOk()) {
      const voodooCheckout = await this.buildVoodooPayCheckoutUrl({
        tenantId: input.tenantId,
        guildId: input.guildId,
        orderSessionId: orderSession.id,
        customerDiscordUserId: input.customerDiscordUserId,
        totalMinor,
        currency: primaryItem.currency,
        answers: parsedAnswers.data,
        integration: voodooIntegration.value,
        token,
      });

      if (voodooCheckout.isErr()) {
        await this.tryCancelPendingOrderSession({
          tenantId: input.tenantId,
          orderSessionId: orderSession.id,
        });
        return err(voodooCheckout.error);
      }

      await this.orderRepository.setCheckoutUrl({
        tenantId: input.tenantId,
        orderSessionId: orderSession.id,
        checkoutUrl: voodooCheckout.value,
      });

      return ok({
        orderSessionId: orderSession.id,
        checkoutUrl: voodooCheckout.value,
        expiresAt: expiresAt.toISOString(),
      });
    }

    if (wooIntegration.isErr()) {
      return err(wooIntegration.error);
    }

    const productForCheckout = await this.productRepository.getById({
      tenantId: input.tenantId,
      guildId: input.guildId,
      productId: primaryItem.productId,
    });
    const primaryVariantCheckoutPath =
      productForCheckout?.variants.find((item) => item.id === primaryItem.variantId)?.wooCheckoutPath ?? null;

    const checkoutTarget =
      primaryVariantCheckoutPath && primaryVariantCheckoutPath.length > 0
        ? new URL(primaryVariantCheckoutPath, wooIntegration.value.wpBaseUrl)
        : new URL(wooIntegration.value.wpBaseUrl);

    checkoutTarget.searchParams.set('vd_token', token);
    checkoutTarget.searchParams.set('vd_order_session_id', orderSession.id);
    const providerCheckoutUrl = checkoutTarget.toString();

    await this.orderRepository.setCheckoutUrl({
      tenantId: input.tenantId,
      orderSessionId: orderSession.id,
      checkoutUrl: providerCheckoutUrl,
    });

    return ok({
      orderSessionId: orderSession.id,
      checkoutUrl: providerCheckoutUrl,
      expiresAt: expiresAt.toISOString(),
    });
  }

  private async buildVoodooPayCheckoutUrl(input: {
    tenantId: string;
    guildId: string;
    orderSessionId: string;
    customerDiscordUserId: string;
    totalMinor: number;
    currency: string;
    answers: Record<string, string>;
    integration: {
      tenantWebhookKey: string;
      merchantWalletAddress: string;
      callbackSecret: string;
      checkoutDomain: string;
    };
    token: string;
  }): Promise<Result<string, AppError>> {
    try {
      const callbackToken = signVoodooCallbackToken(
        {
          tenantId: input.tenantId,
          guildId: input.guildId,
          orderSessionId: input.orderSessionId,
        },
        input.integration.callbackSecret,
      );

      const callbackUrl = new URL(
        `/api/webhooks/voodoopay/${input.integration.tenantWebhookKey}/${input.orderSessionId}/${callbackToken}`,
        this.env.BOT_PUBLIC_URL,
      );
      // Keep query params for backward compatibility with existing callback handling.
      callbackUrl.searchParams.set('order_session_id', input.orderSessionId);
      callbackUrl.searchParams.set('cb_token', callbackToken);

      const createWalletUrl = new URL('/control/wallet.php', this.env.VOODOO_PAY_API_BASE_URL);
      createWalletUrl.searchParams.set('address', input.integration.merchantWalletAddress);
      createWalletUrl.searchParams.set('callback', callbackUrl.toString());

      const walletResponse = await fetch(createWalletUrl.toString());
      if (!walletResponse.ok) {
        return err(
          new AppError(
            'VOODOO_PAY_CREATE_WALLET_FAILED',
            `Voodoo Pay wallet creation failed with status ${walletResponse.status}`,
            502,
          ),
        );
      }

      const walletPayload = (await walletResponse.json()) as {
        address_in?: unknown;
        ipn_token?: unknown;
      };

      if (typeof walletPayload.address_in !== 'string' || walletPayload.address_in.length === 0) {
        return err(
          new AppError('VOODOO_PAY_INVALID_WALLET_RESPONSE', 'Missing address_in in wallet response', 502),
        );
      }

      const checkoutUrl = new URL('/pay.php', this.env.VOODOO_PAY_CHECKOUT_BASE_URL);
      checkoutUrl.searchParams.set('address', walletPayload.address_in);
      checkoutUrl.searchParams.set('amount', (input.totalMinor / 100).toFixed(2));
      checkoutUrl.searchParams.set('currency', input.currency);
      checkoutUrl.searchParams.set('domain', input.integration.checkoutDomain);
      checkoutUrl.searchParams.set('vd_token', input.token);
      checkoutUrl.searchParams.set('vd_order_session_id', input.orderSessionId);

      const customerEmail = this.resolveCheckoutEmail({
        answers: input.answers,
        customerDiscordUserId: input.customerDiscordUserId,
        orderSessionId: input.orderSessionId,
      });
      checkoutUrl.searchParams.set('email', customerEmail);

      if (typeof walletPayload.ipn_token === 'string' && walletPayload.ipn_token.length > 0) {
        checkoutUrl.searchParams.set('ipn_token', walletPayload.ipn_token);
      }

      return ok(checkoutUrl.toString());
    } catch (error) {
      return err(fromUnknownError(error, 'VOODOO_PAY_CHECKOUT_FAILED'));
    }
  }

  private findCustomerEmail(answers: Record<string, string>): string | null {
    for (const value of Object.values(answers)) {
      if (emailRegex.test(value.trim())) {
        return value.trim();
      }
    }

    return null;
  }

  private resolveCheckoutEmail(input: {
    answers: Record<string, string>;
    customerDiscordUserId: string;
    orderSessionId: string;
  }): string {
    const emailFromAnswers = this.findCustomerEmail(input.answers);
    if (emailFromAnswers) {
      return emailFromAnswers;
    }

    const localPartBase =
      input.customerDiscordUserId.trim().length > 0
        ? `discord-${input.customerDiscordUserId.trim()}`
        : `order-${input.orderSessionId.toLowerCase()}`;
    const localPart = localPartBase.replace(/[^a-zA-Z0-9._+-]/g, '').slice(0, 60) || 'customer';

    return `${localPart}@${this.resolveFallbackEmailDomain()}`;
  }

  private resolveFallbackEmailDomain(): string {
    try {
      const url = new URL(this.env.BOT_PUBLIC_URL);
      const hostname = url.hostname.trim().toLowerCase();
      if (hostname.includes('.')) {
        return hostname;
      }
    } catch {
      // ignore URL parsing failures and use static fallback domain.
    }

    return FALLBACK_EMAIL_DOMAIN;
  }

  private async tryCancelPendingOrderSession(input: {
    tenantId: string;
    orderSessionId: string;
  }): Promise<void> {
    try {
      await this.orderRepository.cancelOrderSession(input);
    } catch {
      // ignore cancellation errors and preserve original failure response.
    }
  }

  private async resolveSaleItems(input: {
    tenantId: string;
    guildId: string;
    requestedItems: Array<{ productId: string; variantId: string }>;
  }): Promise<Result<ResolvedSaleItem[], AppError>> {
    const resolvedItems: ResolvedSaleItem[] = [];
    let basketCurrency: string | null = null;

    for (const requested of input.requestedItems) {
      const product = await this.productRepository.getById({
        tenantId: input.tenantId,
        guildId: input.guildId,
        productId: requested.productId,
      });
      if (!product || !product.active) {
        return err(new AppError('PRODUCT_NOT_FOUND', 'Product not found', 404));
      }

      const variant = product.variants.find((item) => item.id === requested.variantId);
      if (!variant) {
        return err(new AppError('VARIANT_NOT_FOUND', 'Variant not found', 404));
      }

      if (basketCurrency && basketCurrency !== variant.currency) {
        return err(
          new AppError(
            'BASKET_CURRENCY_MISMATCH',
            'All basket items must use the same currency',
            400,
          ),
        );
      }
      basketCurrency = variant.currency;

      resolvedItems.push({
        productId: product.id,
        productName: product.name,
        category: product.category,
        variantId: variant.id,
        variantLabel: variant.label,
        priceMinor: variant.priceMinor,
        currency: variant.currency,
      });
    }

    return ok(resolvedItems);
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
        tipEnabled: boolean;
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
        tipEnabled: config.tipEnabled,
        ticketMetadataKey: config.ticketMetadataKey,
      });
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }
}
