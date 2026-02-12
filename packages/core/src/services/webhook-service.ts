import pRetry, { AbortError } from 'p-retry';
import { err, ok, type Result } from 'neverthrow';

import { AppError, fromUnknownError } from '../domain/errors.js';
import type { WooOrderNote, WooOrderPayload } from '../domain/types.js';
import { postMessageToDiscordChannel } from '../integrations/discord-rest.js';
import { OrderRepository } from '../repositories/order-repository.js';
import { ProductRepository } from '../repositories/product-repository.js';
import { TenantRepository } from '../repositories/tenant-repository.js';
import { verifyVoodooCallbackToken } from '../security/voodoo-callback-token.js';
import { isPaidWooStatus, verifyWooWebhookSignature } from '../security/webhook-signature.js';
import { maskAnswers } from '../utils/mask.js';
import { enqueueWebhookTask } from '../workers/webhook-queue.js';
import { AdminService } from './admin-service.js';
import { IntegrationService } from './integration-service.js';

function extractWooOrder(rawPayload: Record<string, unknown>): WooOrderPayload | null {
  const maybeOrder = (rawPayload.order ?? rawPayload) as Partial<WooOrderPayload>;

  if (!maybeOrder || typeof maybeOrder.id !== 'number' || typeof maybeOrder.status !== 'string') {
    return null;
  }

  return {
    id: maybeOrder.id,
    status: maybeOrder.status,
    number: maybeOrder.number,
    total: maybeOrder.total,
    currency: maybeOrder.currency,
    meta_data: Array.isArray(maybeOrder.meta_data)
      ? maybeOrder.meta_data.filter(
          (item): item is { id?: number; key: string; value: string | number | boolean | null } =>
            typeof item === 'object' &&
            item !== null &&
            'key' in item &&
            typeof item.key === 'string' &&
            'value' in item,
        )
      : [],
  };
}

function findOrderSessionId(order: WooOrderPayload): string | null {
  const record = order.meta_data?.find((meta) => meta.key === 'vd_order_session_id');
  if (!record) {
    return null;
  }

  if (typeof record.value === 'string') {
    return record.value;
  }

  if (typeof record.value === 'number') {
    return String(record.value);
  }

  return null;
}

function toMinor(total: string | undefined): number {
  if (!total) {
    return 0;
  }

  const numeric = Number(total);
  if (Number.isNaN(numeric)) {
    return 0;
  }

  return Math.round(numeric * 100);
}

function truncate(text: string | null, maxLength = 500): string | null {
  if (!text) {
    return null;
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

export class WebhookService {
  private readonly integrationService = new IntegrationService();
  private readonly orderRepository = new OrderRepository();
  private readonly productRepository = new ProductRepository();
  private readonly tenantRepository = new TenantRepository();
  private readonly adminService = new AdminService();

  public async handleWooWebhook(input: {
    tenantWebhookKey: string;
    rawBody: string;
    signatureHeader: string | null;
    topicHeader: string | null;
    deliveryIdHeader: string | null;
  }): Promise<Result<{ status: 'accepted' | 'duplicate' }, AppError>> {
    try {
      const integrationResult = await this.integrationService.getResolvedWooIntegrationByWebhookKey(
        input.tenantWebhookKey,
      );

      if (integrationResult.isErr()) {
        return err(integrationResult.error);
      }

      const integration = integrationResult.value;
      const payload = JSON.parse(input.rawBody) as Record<string, unknown>;
      const deliveryId = input.deliveryIdHeader ?? `missing-${Date.now()}`;
      const topic = input.topicHeader ?? 'unknown';

      const signatureValid = verifyWooWebhookSignature({
        rawBody: input.rawBody,
        secret: integration.webhookSecret,
        providedSignature: input.signatureHeader,
      });

      const created = await this.orderRepository.createWebhookEvent({
        tenantId: integration.tenantId,
        guildId: integration.guildId,
        provider: 'woocommerce',
        deliveryId,
        topic,
        signatureValid,
        payload,
      });

      if (!created.created) {
        return ok({ status: 'duplicate' });
      }

      if (!signatureValid) {
        await this.orderRepository.markWebhookFailed({
          webhookEventId: created.webhookEventId,
          failureReason: 'Invalid webhook signature',
          attemptCount: 1,
          nextRetryAt: null,
        });

        return err(new AppError('INVALID_WEBHOOK_SIGNATURE', 'Invalid webhook signature', 401));
      }

      void enqueueWebhookTask(async () => {
        await pRetry(
          async () => {
            await this.processWooPaidEvent({
              integration,
              payload,
              webhookEventId: created.webhookEventId,
            });
          },
          {
            retries: 3,
            minTimeout: 1_000,
            factor: 2,
            onFailedAttempt: async (error) => {
              const nextRetryAt = new Date(Date.now() + error.attemptNumber * 1000);
              await this.orderRepository.markWebhookFailed({
                webhookEventId: created.webhookEventId,
                failureReason: error.error instanceof Error ? error.error.message : 'Webhook retry failure',
                attemptCount: error.attemptNumber,
                nextRetryAt,
              });
            },
          },
        ).catch(async (error) => {
          await this.orderRepository.markWebhookFailed({
            webhookEventId: created.webhookEventId,
            failureReason: error instanceof Error ? error.message : 'Unknown webhook processing failure',
            attemptCount: 4,
            nextRetryAt: null,
          });
        });
      });

      return ok({ status: 'accepted' });
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async handleVoodooPayCallback(input: {
    tenantWebhookKey: string;
    query: Record<string, string>;
  }): Promise<Result<{ status: 'accepted' | 'duplicate' }, AppError>> {
    try {
      const integrationResult = await this.integrationService.getResolvedVoodooPayIntegrationByWebhookKey(
        input.tenantWebhookKey,
      );
      if (integrationResult.isErr()) {
        return err(integrationResult.error);
      }

      const integration = integrationResult.value;
      const orderSessionId = input.query.order_session_id;
      if (!orderSessionId) {
        return err(new AppError('MISSING_ORDER_SESSION_ID', 'Missing order_session_id in callback', 400));
      }

      const signatureValid = verifyVoodooCallbackToken({
        payload: {
          tenantId: integration.tenantId,
          guildId: integration.guildId,
          orderSessionId,
        },
        secret: integration.callbackSecret,
        providedToken: input.query.cb_token,
      });

      const deliveryId =
        input.query.txid_in ??
        input.query.txid_out ??
        input.query.ipn_token ??
        `session-${orderSessionId}-${Date.now()}`;

      const created = await this.orderRepository.createWebhookEvent({
        tenantId: integration.tenantId,
        guildId: integration.guildId,
        provider: 'voodoopay',
        deliveryId,
        topic: 'callback',
        signatureValid,
        payload: input.query,
      });

      if (!created.created) {
        return ok({ status: 'duplicate' });
      }

      if (!signatureValid) {
        await this.orderRepository.markWebhookFailed({
          webhookEventId: created.webhookEventId,
          failureReason: 'Invalid callback token',
          attemptCount: 1,
          nextRetryAt: null,
        });

        return err(new AppError('INVALID_CALLBACK_SIGNATURE', 'Invalid callback token', 401));
      }

      void enqueueWebhookTask(async () => {
        await pRetry(
          async () => {
            await this.processVoodooPayPaidEvent({
              tenantId: integration.tenantId,
              guildId: integration.guildId,
              orderSessionId,
              query: input.query,
              webhookEventId: created.webhookEventId,
            });
          },
          {
            retries: 3,
            minTimeout: 1_000,
            factor: 2,
            onFailedAttempt: async (error) => {
              const nextRetryAt = new Date(Date.now() + error.attemptNumber * 1000);
              await this.orderRepository.markWebhookFailed({
                webhookEventId: created.webhookEventId,
                failureReason: error.error instanceof Error ? error.error.message : 'Webhook retry failure',
                attemptCount: error.attemptNumber,
                nextRetryAt,
              });
            },
          },
        ).catch(async (error) => {
          await this.orderRepository.markWebhookFailed({
            webhookEventId: created.webhookEventId,
            failureReason: error instanceof Error ? error.message : 'Unknown webhook processing failure',
            attemptCount: 4,
            nextRetryAt: null,
          });
        });
      });

      return ok({ status: 'accepted' });
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  private async processWooPaidEvent(input: {
    integration: {
      tenantId: string;
      guildId: string;
      wpBaseUrl: string;
      consumerKey: string;
      consumerSecret: string;
    };
    payload: Record<string, unknown>;
    webhookEventId: string;
  }): Promise<void> {
    const order = extractWooOrder(input.payload);
    if (!order) {
      throw new AbortError('Webhook payload does not contain a valid Woo order');
    }

    if (!isPaidWooStatus(order.status)) {
      await this.orderRepository.markWebhookProcessed(input.webhookEventId);
      return;
    }

    const orderSessionId = findOrderSessionId(order);
    if (!orderSessionId) {
      throw new AbortError('Missing vd_order_session_id in Woo order meta');
    }

    const orderSession = await this.orderRepository.getOrderSession({
      tenantId: input.integration.tenantId,
      orderSessionId,
    });

    if (!orderSession) {
      throw new AbortError('Order session not found for webhook');
    }

    const product = await this.productRepository.getById({
      tenantId: orderSession.tenantId,
      guildId: orderSession.guildId,
      productId: orderSession.productId,
    });

    if (!product) {
      throw new AbortError('Product not found for paid order');
    }

    const variant = product.variants.find((item) => item.id === orderSession.variantId);
    if (!variant) {
      throw new AbortError('Variant not found for paid order');
    }

    const created = await this.orderRepository.createPaidOrder({
      tenantId: orderSession.tenantId,
      guildId: orderSession.guildId,
      orderSessionId: orderSession.id,
      providerOrderId: String(order.id),
      status: order.status,
      priceMinor: variant.priceMinor || toMinor(order.total),
      currency: variant.currency || order.currency || 'USD',
      paymentReference: order.number ?? null,
    });

    if (!created) {
      await this.orderRepository.markWebhookDuplicate(input.webhookEventId);
      return;
    }

    await this.orderRepository.markOrderSessionPaid({
      tenantId: orderSession.tenantId,
      orderSessionId: orderSession.id,
    });

    const notes = await this.fetchWooNotes({
      wpBaseUrl: input.integration.wpBaseUrl,
      consumerKey: input.integration.consumerKey,
      consumerSecret: input.integration.consumerSecret,
      wooOrderId: order.id,
    });

    await this.orderRepository.cacheOrderNotes({
      tenantId: orderSession.tenantId,
      guildId: orderSession.guildId,
      orderSessionId: orderSession.id,
      wooOrderId: String(order.id),
      latestInternalNote: truncate(notes.latestInternal),
      latestCustomerNote: truncate(notes.latestCustomer),
    });

    const config = await this.tenantRepository.getGuildConfig({
      tenantId: orderSession.tenantId,
      guildId: orderSession.guildId,
    });

    if (!config?.paidLogChannelId) {
      throw new AbortError('Paid log channel is not configured');
    }

    const sensitiveKeys = await this.productRepository.getSensitiveFieldKeys(orderSession.productId);
    const maskedAnswers = maskAnswers(orderSession.answers, sensitiveKeys);
    const answersContent = Object.entries(maskedAnswers)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');

    const botTokenResult = await this.adminService.getResolvedBotToken();
    if (botTokenResult.isErr()) {
      throw new AbortError(botTokenResult.error.message);
    }

    const message = [
      '**Order Paid**',
      `Provider: WooCommerce`,
      `Order Session: ${orderSession.id}`,
      `Woo Order: ${order.id}`,
      `Product: ${product.name}`,
      `Variant: ${variant.label}`,
      `Price: ${(variant.priceMinor / 100).toFixed(2)} ${variant.currency}`,
      '',
      '**Answers**',
      answersContent || '- (none)',
      '',
      '**Order Notes**',
      `Internal: ${truncate(notes.latestInternal, 240) ?? '(none)'}`,
      `Customer: ${truncate(notes.latestCustomer, 240) ?? '(none)'}`,
    ].join('\n');

    await postMessageToDiscordChannel({
      botToken: botTokenResult.value,
      channelId: config.paidLogChannelId,
      content: message,
    });

    await this.orderRepository.markWebhookProcessed(input.webhookEventId);
  }

  private async processVoodooPayPaidEvent(input: {
    tenantId: string;
    guildId: string;
    orderSessionId: string;
    query: Record<string, string>;
    webhookEventId: string;
  }): Promise<void> {
    if (!input.query.txid_in && !input.query.txid_out) {
      await this.orderRepository.markWebhookProcessed(input.webhookEventId);
      return;
    }

    const orderSession = await this.orderRepository.getOrderSession({
      tenantId: input.tenantId,
      orderSessionId: input.orderSessionId,
    });

    if (!orderSession) {
      throw new AbortError('Order session not found for callback');
    }

    const product = await this.productRepository.getById({
      tenantId: orderSession.tenantId,
      guildId: orderSession.guildId,
      productId: orderSession.productId,
    });

    if (!product) {
      throw new AbortError('Product not found for paid order');
    }

    const variant = product.variants.find((item) => item.id === orderSession.variantId);
    if (!variant) {
      throw new AbortError('Variant not found for paid order');
    }

    const providerOrderId = input.query.txid_in ?? input.query.txid_out ?? input.orderSessionId;
    const paymentReference = input.query.txid_out ?? input.query.txid_in ?? null;

    const created = await this.orderRepository.createPaidOrder({
      tenantId: orderSession.tenantId,
      guildId: orderSession.guildId,
      orderSessionId: orderSession.id,
      providerOrderId,
      status: 'paid',
      priceMinor: variant.priceMinor,
      currency: variant.currency,
      paymentReference,
    });

    if (!created) {
      await this.orderRepository.markWebhookDuplicate(input.webhookEventId);
      return;
    }

    await this.orderRepository.markOrderSessionPaid({
      tenantId: orderSession.tenantId,
      orderSessionId: orderSession.id,
    });

    const config = await this.tenantRepository.getGuildConfig({
      tenantId: orderSession.tenantId,
      guildId: orderSession.guildId,
    });

    if (!config?.paidLogChannelId) {
      throw new AbortError('Paid log channel is not configured');
    }

    const sensitiveKeys = await this.productRepository.getSensitiveFieldKeys(orderSession.productId);
    const maskedAnswers = maskAnswers(orderSession.answers, sensitiveKeys);
    const answersContent = Object.entries(maskedAnswers)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');

    const botTokenResult = await this.adminService.getResolvedBotToken();
    if (botTokenResult.isErr()) {
      throw new AbortError(botTokenResult.error.message);
    }

    const message = [
      '**Order Paid**',
      `Provider: Voodoo Pay`,
      `Order Session: ${orderSession.id}`,
      `Transaction In: ${input.query.txid_in ?? '(none)'}`,
      `Transaction Out: ${input.query.txid_out ?? '(none)'}`,
      `Coin: ${input.query.coin ?? '(unknown)'}`,
      `Forwarded Value: ${input.query.value_forwarded_coin ?? '(unknown)'}`,
      `Product: ${product.name}`,
      `Variant: ${variant.label}`,
      `Price: ${(variant.priceMinor / 100).toFixed(2)} ${variant.currency}`,
      '',
      '**Answers**',
      answersContent || '- (none)',
    ].join('\n');

    await postMessageToDiscordChannel({
      botToken: botTokenResult.value,
      channelId: config.paidLogChannelId,
      content: message,
    });

    await this.orderRepository.markWebhookProcessed(input.webhookEventId);
  }

  private async fetchWooNotes(input: {
    wpBaseUrl: string;
    consumerKey: string;
    consumerSecret: string;
    wooOrderId: number;
  }): Promise<{ latestInternal: string | null; latestCustomer: string | null }> {
    const notesUrl = new URL(`/wp-json/wc/v3/orders/${input.wooOrderId}/notes`, input.wpBaseUrl).toString();
    const auth = Buffer.from(`${input.consumerKey}:${input.consumerSecret}`).toString('base64');

    const response = await fetch(notesUrl, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    if (!response.ok) {
      return {
        latestInternal: null,
        latestCustomer: null,
      };
    }

    const notes = (await response.json()) as WooOrderNote[];
    const latestInternal = [...notes].reverse().find((note) => note.customer_note === false)?.note ?? null;
    const latestCustomer = [...notes].reverse().find((note) => note.customer_note === true)?.note ?? null;

    return {
      latestInternal,
      latestCustomer,
    };
  }
}
