import crypto from 'node:crypto';

import pRetry, { AbortError } from 'p-retry';
import { err, ok, type Result } from 'neverthrow';

import { getEnv } from '../config/env.js';
import { AppError, fromUnknownError } from '../domain/errors.js';
import type { WooOrderNote, WooOrderPayload } from '../domain/types.js';
import { logger } from '../infra/logger.js';
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

function firstNonEmpty(query: Record<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const value = query[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function hasTruthySignal(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'y') {
    return true;
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0;
}

function hasPositiveAmount(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const numeric = Number(value.trim());
  return Number.isFinite(numeric) && numeric > 0;
}

function normalizeStatus(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

const VOODOO_PAID_STATUSES = new Set([
  'paid',
  'complete',
  'completed',
  'confirmed',
  'success',
  'successful',
  'done',
  'finished',
  'ok',
]);

const VOODOO_FAILED_STATUSES = new Set([
  'failed',
  'error',
  'cancelled',
  'canceled',
  'expired',
  'rejected',
  'invalid',
  'refunded',
]);

const VOODOO_UNPAID_STATUSES = new Set([
  'unpaid',
  'pending',
  'waiting',
  'awaiting',
  'processing',
  ...VOODOO_FAILED_STATUSES,
]);

type VoodooPaymentState = {
  paid: boolean;
  status: string | null;
  txidIn: string | null;
  txidOut: string | null;
  transactionId: string | null;
};

export function resolveVoodooPaymentState(query: Record<string, string>): VoodooPaymentState {
  const txidIn = firstNonEmpty(query, ['txid_in', 'tx_in', 'incoming_txid', 'txidin']);
  const txidOut = firstNonEmpty(query, ['txid_out', 'tx_out', 'outgoing_txid', 'txidout']);
  const transactionId = firstNonEmpty(query, [
    'txid',
    'transaction_id',
    'transaction_hash',
    'hash',
    'payment_id',
    'payment_hash',
  ]);

  const status = normalizeStatus(firstNonEmpty(query, ['status', 'payment_status', 'state', 'result']));
  const confirmed = hasTruthySignal(
    firstNonEmpty(query, ['confirmed', 'is_confirmed', 'paid', 'success', 'confirmations']),
  );
  const positiveAmount = hasPositiveAmount(
    firstNonEmpty(query, ['value_forwarded_coin', 'value_coin', 'amount', 'value']),
  );

  if (status && VOODOO_FAILED_STATUSES.has(status)) {
    return {
      paid: false,
      status,
      txidIn,
      txidOut,
      transactionId,
    };
  }

  if (txidIn || txidOut || transactionId || confirmed || positiveAmount) {
    return {
      paid: true,
      status,
      txidIn,
      txidOut,
      transactionId,
    };
  }

  if (status && VOODOO_PAID_STATUSES.has(status)) {
    return {
      paid: true,
      status,
      txidIn,
      txidOut,
      transactionId,
    };
  }

  return {
    paid: false,
    status,
    txidIn,
    txidOut,
    transactionId,
  };
}

export function buildVoodooDeliveryId(orderSessionId: string, query: Record<string, string>): string {
  const fingerprint = {
    orderSessionId,
    ipnToken: firstNonEmpty(query, ['ipn_token', 'callback_id']),
    txidIn: firstNonEmpty(query, ['txid_in', 'tx_in', 'incoming_txid', 'txidin']),
    txidOut: firstNonEmpty(query, ['txid_out', 'tx_out', 'outgoing_txid', 'txidout']),
    txid: firstNonEmpty(query, ['txid', 'transaction_id', 'transaction_hash', 'hash']),
    status: normalizeStatus(firstNonEmpty(query, ['status', 'payment_status', 'state', 'result'])),
    value: firstNonEmpty(query, ['value_forwarded_coin', 'value_coin', 'amount', 'value']),
  };

  const hash = crypto.createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex').slice(0, 60);
  return `vp-${hash}`;
}

function fitDiscordMessage(content: string, maxLength = 1900): string {
  if (content.length <= maxLength) {
    return content;
  }

  return `${content.slice(0, maxLength - 20)}\n\n[message truncated]`;
}

export class WebhookService {
  private readonly env = getEnv();
  private readonly integrationService = new IntegrationService();
  private readonly orderRepository = new OrderRepository();
  private readonly productRepository = new ProductRepository();
  private readonly tenantRepository = new TenantRepository();
  private readonly adminService = new AdminService();

  private async checkVoodooPaymentStatus(
    ipnToken: string | null,
  ): Promise<{ paid: boolean; status: string | null }> {
    if (!ipnToken) {
      return { paid: false, status: null };
    }

    try {
      const statusUrl = new URL('/control/payment-status.php', this.env.VOODOO_PAY_API_BASE_URL);
      statusUrl.searchParams.set('ipn_token', ipnToken);

      const response = await fetch(statusUrl.toString());
      if (!response.ok) {
        return { paid: false, status: null };
      }

      const raw = (await response.text()).trim();
      if (!raw) {
        return { paid: false, status: null };
      }

      let statusCandidate: string | null = null;
      const maybeJson = raw.startsWith('{') || raw.startsWith('[');

      if (maybeJson) {
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown> | string | null;
          if (typeof parsed === 'string') {
            statusCandidate = parsed;
          } else if (parsed && typeof parsed === 'object') {
            statusCandidate = firstNonEmpty(
              Object.fromEntries(
                Object.entries(parsed).map(([key, value]) => [key, String(value ?? '')]),
              ),
              ['status', 'payment_status', 'result', 'state'],
            );
          }
        } catch {
          statusCandidate = raw;
        }
      } else {
        statusCandidate = raw;
      }

      const normalized = normalizeStatus(statusCandidate);
      if (!normalized) {
        return { paid: false, status: null };
      }

      if (VOODOO_PAID_STATUSES.has(normalized)) {
        return { paid: true, status: normalized };
      }

      if (VOODOO_UNPAID_STATUSES.has(normalized)) {
        return { paid: false, status: normalized };
      }

      return { paid: false, status: normalized };
    } catch {
      return { paid: false, status: null };
    }
  }

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
        const existingStatus = await this.orderRepository.getWebhookEventStatus(created.webhookEventId);
        if (existingStatus === 'failed') {
          logger.warn(
            {
              provider: 'woocommerce',
              tenantId: integration.tenantId,
              guildId: integration.guildId,
              webhookEventId: created.webhookEventId,
            },
            'duplicate webhook received for failed event; scheduling retry',
          );
          await this.orderRepository.resetWebhookForRetry(created.webhookEventId);
          this.enqueueWooProcessing({
            integration,
            payload,
            webhookEventId: created.webhookEventId,
          });
          return ok({ status: 'accepted' });
        }

        return ok({ status: 'duplicate' });
      }

      if (!signatureValid) {
        logger.warn(
          {
            provider: 'woocommerce',
            tenantId: integration.tenantId,
            guildId: integration.guildId,
            deliveryId,
            topic,
          },
          'woo webhook rejected: invalid signature',
        );
        await this.orderRepository.markWebhookFailed({
          webhookEventId: created.webhookEventId,
          failureReason: 'Invalid webhook signature',
          attemptCount: 1,
          nextRetryAt: null,
        });

        return err(new AppError('INVALID_WEBHOOK_SIGNATURE', 'Invalid webhook signature', 401));
      }

      this.enqueueWooProcessing({
        integration,
        payload,
        webhookEventId: created.webhookEventId,
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

      const deliveryId = buildVoodooDeliveryId(orderSessionId, input.query);

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
        const existingStatus = await this.orderRepository.getWebhookEventStatus(created.webhookEventId);
        if (existingStatus === 'failed') {
          logger.warn(
            {
              provider: 'voodoopay',
              tenantId: integration.tenantId,
              guildId: integration.guildId,
              webhookEventId: created.webhookEventId,
              orderSessionId,
            },
            'duplicate callback received for failed event; scheduling retry',
          );
          await this.orderRepository.resetWebhookForRetry(created.webhookEventId);
          this.enqueueVoodooProcessing({
            tenantId: integration.tenantId,
            guildId: integration.guildId,
            orderSessionId,
            query: input.query,
            webhookEventId: created.webhookEventId,
          });
          return ok({ status: 'accepted' });
        }

        return ok({ status: 'duplicate' });
      }

      if (!signatureValid) {
        logger.warn(
          {
            provider: 'voodoopay',
            tenantId: integration.tenantId,
            guildId: integration.guildId,
            orderSessionId,
            deliveryId,
            queryKeys: Object.keys(input.query),
          },
          'voodoo callback rejected: invalid callback token',
        );
        await this.orderRepository.markWebhookFailed({
          webhookEventId: created.webhookEventId,
          failureReason: 'Invalid callback token',
          attemptCount: 1,
          nextRetryAt: null,
        });

        return err(new AppError('INVALID_CALLBACK_SIGNATURE', 'Invalid callback token', 401));
      }

      this.enqueueVoodooProcessing({
        tenantId: integration.tenantId,
        guildId: integration.guildId,
        orderSessionId,
        query: input.query,
        webhookEventId: created.webhookEventId,
      });

      return ok({ status: 'accepted' });
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  private enqueueWooProcessing(input: {
    integration: {
      tenantId: string;
      guildId: string;
      wpBaseUrl: string;
      consumerKey: string;
      consumerSecret: string;
    };
    payload: Record<string, unknown>;
    webhookEventId: string;
  }): void {
    void enqueueWebhookTask(async () => {
      await pRetry(
        async () => {
          await this.processWooPaidEvent({
            integration: input.integration,
            payload: input.payload,
            webhookEventId: input.webhookEventId,
          });
        },
        {
          retries: 3,
          minTimeout: 1_000,
          factor: 2,
          onFailedAttempt: async (error) => {
            const failureReason =
              error.error instanceof Error ? error.error.message : 'Webhook retry failure';
            const nextRetryAt = new Date(Date.now() + error.attemptNumber * 1000);
            logger.warn(
              {
                provider: 'woocommerce',
                webhookEventId: input.webhookEventId,
                attemptNumber: error.attemptNumber,
                retriesLeft: error.retriesLeft,
                failureReason,
              },
              'webhook processing retry scheduled',
            );
            await this.orderRepository.markWebhookFailed({
              webhookEventId: input.webhookEventId,
              failureReason,
              attemptCount: error.attemptNumber,
              nextRetryAt,
            });
          },
        },
      ).catch(async (error) => {
        const failureReason =
          error instanceof Error ? error.message : 'Unknown webhook processing failure';
        logger.error(
          {
            provider: 'woocommerce',
            webhookEventId: input.webhookEventId,
            failureReason,
          },
          'webhook processing failed permanently',
        );
        await this.orderRepository.markWebhookFailed({
          webhookEventId: input.webhookEventId,
          failureReason,
          attemptCount: 4,
          nextRetryAt: null,
        });
      });
    });
  }

  private enqueueVoodooProcessing(input: {
    tenantId: string;
    guildId: string;
    orderSessionId: string;
    query: Record<string, string>;
    webhookEventId: string;
  }): void {
    void enqueueWebhookTask(async () => {
      await pRetry(
        async () => {
          await this.processVoodooPayPaidEvent({
            tenantId: input.tenantId,
            guildId: input.guildId,
            orderSessionId: input.orderSessionId,
            query: input.query,
            webhookEventId: input.webhookEventId,
          });
        },
        {
          retries: 3,
          minTimeout: 1_000,
          factor: 2,
          onFailedAttempt: async (error) => {
            const failureReason =
              error.error instanceof Error ? error.error.message : 'Webhook retry failure';
            const nextRetryAt = new Date(Date.now() + error.attemptNumber * 1000);
            logger.warn(
              {
                provider: 'voodoopay',
                webhookEventId: input.webhookEventId,
                orderSessionId: input.orderSessionId,
                attemptNumber: error.attemptNumber,
                retriesLeft: error.retriesLeft,
                failureReason,
              },
              'webhook processing retry scheduled',
            );
            await this.orderRepository.markWebhookFailed({
              webhookEventId: input.webhookEventId,
              failureReason,
              attemptCount: error.attemptNumber,
              nextRetryAt,
            });
          },
        },
      ).catch(async (error) => {
        const failureReason =
          error instanceof Error ? error.message : 'Unknown webhook processing failure';
        logger.error(
          {
            provider: 'voodoopay',
            webhookEventId: input.webhookEventId,
            orderSessionId: input.orderSessionId,
            failureReason,
          },
          'webhook processing failed permanently',
        );
        await this.orderRepository.markWebhookFailed({
          webhookEventId: input.webhookEventId,
          failureReason,
          attemptCount: 4,
          nextRetryAt: null,
        });
      });
    });
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
      logger.info(
        {
          provider: 'woocommerce',
          tenantId: orderSession.tenantId,
          guildId: orderSession.guildId,
          orderSessionId: orderSession.id,
          webhookEventId: input.webhookEventId,
        },
        'paid event ignored as duplicate',
      );
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

    const sensitiveKeys = await this.productRepository.getSensitiveFieldKeys(orderSession.productId);
    const maskedAnswers = maskAnswers(orderSession.answers, sensitiveKeys);
    const answersContent = Object.entries(maskedAnswers)
      .map(([key, value]) => `- ${key}: \`${value.replace(/`/g, "'")}\``)
      .join('\n');

    const botTokensResult = await this.getBotTokenCandidates();
    if (botTokensResult.isErr()) {
      throw new AbortError(botTokensResult.error.message);
    }

    const message = [
      '**Order Paid**',
      `Provider: WooCommerce`,
      `Order Session: ${orderSession.id}`,
      `Woo Order: ${order.id}`,
      '',
      '**Order Details**',
      `Category: ${product.category}`,
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

    await this.postPaidLogMessage({
      botTokens: botTokensResult.value,
      preferredChannelId: config?.paidLogChannelId ?? null,
      fallbackChannelId: orderSession.ticketChannelId,
      content: message,
    });
    await this.postTicketPaidConfirmation({
      botTokens: botTokensResult.value,
      ticketChannelId: orderSession.ticketChannelId,
      customerDiscordId: orderSession.customerDiscordId,
      orderSessionId: orderSession.id,
      productName: product.name,
      variantLabel: variant.label,
      currency: variant.currency,
      priceMinor: variant.priceMinor,
    });

    logger.info(
      {
        provider: 'woocommerce',
        tenantId: orderSession.tenantId,
        guildId: orderSession.guildId,
        orderSessionId: orderSession.id,
        webhookEventId: input.webhookEventId,
        paidLogChannelId: config?.paidLogChannelId ?? null,
        fallbackChannelId: orderSession.ticketChannelId,
      },
      'paid log posted',
    );

    await this.orderRepository.markWebhookProcessed(input.webhookEventId);
  }

  private async processVoodooPayPaidEvent(input: {
    tenantId: string;
    guildId: string;
    orderSessionId: string;
    query: Record<string, string>;
    webhookEventId: string;
  }): Promise<void> {
    let paymentState = resolveVoodooPaymentState(input.query);
    if (!paymentState.paid) {
      const ipnToken = firstNonEmpty(input.query, ['ipn_token', 'callback_id']);
      const polledStatus = await this.checkVoodooPaymentStatus(ipnToken);
      if (polledStatus.paid) {
        paymentState = {
          ...paymentState,
          paid: true,
          status: polledStatus.status ?? paymentState.status ?? 'paid',
        };
      } else {
        logger.info(
          {
            provider: 'voodoopay',
            tenantId: input.tenantId,
            guildId: input.guildId,
            orderSessionId: input.orderSessionId,
            webhookEventId: input.webhookEventId,
            callbackStatus: paymentState.status,
            polledStatus: polledStatus.status,
            queryKeys: Object.keys(input.query),
          },
          'voodoo callback received but payment is not settled',
        );
        await this.orderRepository.markWebhookProcessed(input.webhookEventId);
        return;
      }
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

    const providerOrderId =
      paymentState.txidIn ??
      paymentState.txidOut ??
      paymentState.transactionId ??
      firstNonEmpty(input.query, ['ipn_token', 'callback_id']) ??
      input.orderSessionId;
    const paymentReference =
      paymentState.txidOut ?? paymentState.txidIn ?? paymentState.transactionId ?? null;

    const created = await this.orderRepository.createPaidOrder({
      tenantId: orderSession.tenantId,
      guildId: orderSession.guildId,
      orderSessionId: orderSession.id,
      providerOrderId,
      status: paymentState.status ?? 'paid',
      priceMinor: variant.priceMinor,
      currency: variant.currency,
      paymentReference,
    });

    if (!created) {
      logger.info(
        {
          provider: 'voodoopay',
          tenantId: orderSession.tenantId,
          guildId: orderSession.guildId,
          orderSessionId: orderSession.id,
          webhookEventId: input.webhookEventId,
        },
        'paid event ignored as duplicate',
      );
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

    const sensitiveKeys = await this.productRepository.getSensitiveFieldKeys(orderSession.productId);
    const maskedAnswers = maskAnswers(orderSession.answers, sensitiveKeys);
    const answersContent = Object.entries(maskedAnswers)
      .map(([key, value]) => `- ${key}: \`${value.replace(/`/g, "'")}\``)
      .join('\n');

    const botTokensResult = await this.getBotTokenCandidates();
    if (botTokensResult.isErr()) {
      throw new AbortError(botTokensResult.error.message);
    }

    const message = [
      '**Order Paid**',
      `Provider: Voodoo Pay`,
      `Order Session: ${orderSession.id}`,
      `Status: ${paymentState.status ?? 'paid'}`,
      `Transaction In: ${paymentState.txidIn ?? '(none)'}`,
      `Transaction Out: ${paymentState.txidOut ?? '(none)'}`,
      `Transaction: ${paymentState.transactionId ?? '(none)'}`,
      `Coin: ${input.query.coin ?? '(unknown)'}`,
      `Forwarded Value: ${input.query.value_forwarded_coin ?? input.query.value_coin ?? '(unknown)'}`,
      '',
      '**Order Details**',
      `Category: ${product.category}`,
      `Product: ${product.name}`,
      `Variant: ${variant.label}`,
      `Price: ${(variant.priceMinor / 100).toFixed(2)} ${variant.currency}`,
      '',
      '**Answers**',
      answersContent || '- (none)',
    ].join('\n');

    await this.postPaidLogMessage({
      botTokens: botTokensResult.value,
      preferredChannelId: config?.paidLogChannelId ?? null,
      fallbackChannelId: orderSession.ticketChannelId,
      content: message,
    });
    await this.postTicketPaidConfirmation({
      botTokens: botTokensResult.value,
      ticketChannelId: orderSession.ticketChannelId,
      customerDiscordId: orderSession.customerDiscordId,
      orderSessionId: orderSession.id,
      productName: product.name,
      variantLabel: variant.label,
      currency: variant.currency,
      priceMinor: variant.priceMinor,
    });

    logger.info(
      {
        provider: 'voodoopay',
        tenantId: orderSession.tenantId,
        guildId: orderSession.guildId,
        orderSessionId: orderSession.id,
        webhookEventId: input.webhookEventId,
        paidLogChannelId: config?.paidLogChannelId ?? null,
        fallbackChannelId: orderSession.ticketChannelId,
      },
      'paid log posted',
    );

    await this.orderRepository.markWebhookProcessed(input.webhookEventId);
  }

  private async getBotTokenCandidates(): Promise<Result<string[], AppError>> {
    const resolved = await this.adminService.getResolvedBotToken();
    if (resolved.isErr()) {
      return err(resolved.error);
    }

    const candidates = [resolved.value.trim()];
    const envToken = this.env.DISCORD_TOKEN.trim();
    if (envToken && !candidates.includes(envToken)) {
      candidates.push(envToken);
    }

    return ok(candidates.filter(Boolean));
  }

  private isDiscordUnauthorized(error: unknown): boolean {
    if (!(error instanceof AppError)) {
      return false;
    }

    if (error.code !== 'DISCORD_LOG_POST_FAILED') {
      return false;
    }

    if (
      typeof error.details === 'object' &&
      error.details !== null &&
      'discordStatus' in error.details &&
      (error.details as { discordStatus?: unknown }).discordStatus === 401
    ) {
      return true;
    }

    return error.message.includes('(401)');
  }

  private async postPaidLogMessage(input: {
    botTokens: string[];
    preferredChannelId: string | null;
    fallbackChannelId: string;
    content: string;
  }): Promise<void> {
    const targetChannels = [input.preferredChannelId, input.fallbackChannelId].filter(
      (channelId): channelId is string => Boolean(channelId),
    );
    const uniqueChannels = [...new Set(targetChannels)];

    if (uniqueChannels.length === 0) {
      throw new AbortError('No channel available for paid-order log message');
    }

    const uniqueTokens = [...new Set(input.botTokens.map((token) => token.trim()).filter(Boolean))];
    if (uniqueTokens.length === 0) {
      throw new AbortError('No bot token available for paid-order log message');
    }

    let lastError: unknown = null;
    for (const botToken of uniqueTokens) {
      let tokenUnauthorized = false;

      for (const channelId of uniqueChannels) {
        try {
          await postMessageToDiscordChannel({
            botToken,
            channelId,
            content: fitDiscordMessage(input.content),
          });
          return;
        } catch (error) {
          lastError = error;
          logger.warn(
            {
              provider: 'webhook-paid-log',
              channelId,
              unauthorized: this.isDiscordUnauthorized(error),
              errorMessage: error instanceof Error ? error.message : 'unknown',
            },
            'failed to post paid log to channel',
          );
          if (this.isDiscordUnauthorized(error)) {
            tokenUnauthorized = true;
            break;
          }
        }
      }

      if (tokenUnauthorized) {
        continue;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new AbortError('Failed to post paid-order log message');
  }

  private async postTicketPaidConfirmation(input: {
    botTokens: string[];
    ticketChannelId: string;
    customerDiscordId: string;
    orderSessionId: string;
    productName: string;
    variantLabel: string;
    currency: string;
    priceMinor: number;
  }): Promise<void> {
    const message = [
      `Payment received for <@${input.customerDiscordId}>. Thank you.`,
      `Order Session: ${input.orderSessionId}`,
      `Product: ${input.productName}`,
      `Variant: ${input.variantLabel}`,
      `Amount: ${(input.priceMinor / 100).toFixed(2)} ${input.currency}`,
    ].join('\n');

    const uniqueTokens = [...new Set(input.botTokens.map((token) => token.trim()).filter(Boolean))];
    if (uniqueTokens.length === 0) {
      throw new AbortError('No bot token available for ticket paid confirmation');
    }

    let lastError: unknown = null;
    for (const botToken of uniqueTokens) {
      try {
        await postMessageToDiscordChannel({
          botToken,
          channelId: input.ticketChannelId,
          content: fitDiscordMessage(message),
        });
        return;
      } catch (error) {
        lastError = error;
        if (this.isDiscordUnauthorized(error)) {
          continue;
        }
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new AbortError('Failed to post ticket paid confirmation');
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
