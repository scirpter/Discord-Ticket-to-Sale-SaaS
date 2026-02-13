import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { getDb } from '../infra/db/client.js';
import {
  orderNotesCache,
  orderSessions,
  ordersPaid,
  webhookEvents,
} from '../infra/db/schema/index.js';

export type OrderSessionRecord = {
  id: string;
  tenantId: string;
  guildId: string;
  ticketChannelId: string;
  staffUserId: string;
  customerDiscordId: string;
  productId: string;
  variantId: string;
  status: 'pending_payment' | 'cancelled' | 'paid';
  answers: Record<string, string>;
  checkoutUrl: string | null;
  checkoutTokenExpiresAt: Date;
};

export class OrderRepository {
  private readonly db = getDb();

  public async createOrderSession(input: {
    tenantId: string;
    guildId: string;
    ticketChannelId: string;
    staffUserId: string;
    customerDiscordId: string;
    productId: string;
    variantId: string;
    answers: Record<string, string>;
    checkoutTokenExpiresAt: Date;
  }): Promise<OrderSessionRecord> {
    const id = ulid();

    await this.db.insert(orderSessions).values({
      id,
      tenantId: input.tenantId,
      guildId: input.guildId,
      ticketChannelId: input.ticketChannelId,
      staffUserId: input.staffUserId,
      customerDiscordId: input.customerDiscordId,
      productId: input.productId,
      variantId: input.variantId,
      answers: input.answers,
      checkoutTokenExpiresAt: input.checkoutTokenExpiresAt,
      status: 'pending_payment',
    });

    return {
      id,
      tenantId: input.tenantId,
      guildId: input.guildId,
      ticketChannelId: input.ticketChannelId,
      staffUserId: input.staffUserId,
      customerDiscordId: input.customerDiscordId,
      productId: input.productId,
      variantId: input.variantId,
      status: 'pending_payment',
      answers: input.answers,
      checkoutUrl: null,
      checkoutTokenExpiresAt: input.checkoutTokenExpiresAt,
    };
  }

  public async getOrderSession(input: {
    tenantId: string;
    orderSessionId: string;
  }): Promise<OrderSessionRecord | null> {
    const row = await this.db.query.orderSessions.findFirst({
      where: and(eq(orderSessions.id, input.orderSessionId), eq(orderSessions.tenantId, input.tenantId)),
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      tenantId: row.tenantId,
      guildId: row.guildId,
      ticketChannelId: row.ticketChannelId,
      staffUserId: row.staffUserId,
      customerDiscordId: row.customerDiscordId,
      productId: row.productId,
      variantId: row.variantId,
      status: row.status,
      answers: row.answers,
      checkoutUrl: row.checkoutUrl,
      checkoutTokenExpiresAt: row.checkoutTokenExpiresAt,
    };
  }

  public async getOrderSessionById(orderSessionId: string): Promise<OrderSessionRecord | null> {
    const row = await this.db.query.orderSessions.findFirst({
      where: eq(orderSessions.id, orderSessionId),
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      tenantId: row.tenantId,
      guildId: row.guildId,
      ticketChannelId: row.ticketChannelId,
      staffUserId: row.staffUserId,
      customerDiscordId: row.customerDiscordId,
      productId: row.productId,
      variantId: row.variantId,
      status: row.status,
      answers: row.answers,
      checkoutUrl: row.checkoutUrl,
      checkoutTokenExpiresAt: row.checkoutTokenExpiresAt,
    };
  }

  public async getLatestPendingSessionByChannel(input: {
    tenantId: string;
    guildId: string;
    ticketChannelId: string;
  }): Promise<OrderSessionRecord | null> {
    const rows = await this.db.query.orderSessions.findMany({
      where: and(
        eq(orderSessions.tenantId, input.tenantId),
        eq(orderSessions.guildId, input.guildId),
        eq(orderSessions.ticketChannelId, input.ticketChannelId),
      ),
      limit: 20,
    });

    const pending = rows
      .filter((row) => row.status === 'pending_payment')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    if (!pending) {
      return null;
    }

    return {
      id: pending.id,
      tenantId: pending.tenantId,
      guildId: pending.guildId,
      ticketChannelId: pending.ticketChannelId,
      staffUserId: pending.staffUserId,
      customerDiscordId: pending.customerDiscordId,
      productId: pending.productId,
      variantId: pending.variantId,
      status: pending.status,
      answers: pending.answers,
      checkoutUrl: pending.checkoutUrl,
      checkoutTokenExpiresAt: pending.checkoutTokenExpiresAt,
    };
  }

  public async setCheckoutUrl(input: {
    tenantId: string;
    orderSessionId: string;
    checkoutUrl: string;
  }): Promise<void> {
    await this.db
      .update(orderSessions)
      .set({ checkoutUrl: input.checkoutUrl, updatedAt: new Date() })
      .where(and(eq(orderSessions.id, input.orderSessionId), eq(orderSessions.tenantId, input.tenantId)));
  }

  public async cancelOrderSession(input: {
    tenantId: string;
    orderSessionId: string;
  }): Promise<boolean> {
    const current = await this.getOrderSession({
      tenantId: input.tenantId,
      orderSessionId: input.orderSessionId,
    });

    if (!current || current.status !== 'pending_payment') {
      return false;
    }

    await this.db
      .update(orderSessions)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(orderSessions.id, input.orderSessionId));

    return true;
  }

  public async markOrderSessionPaid(input: {
    tenantId: string;
    orderSessionId: string;
  }): Promise<void> {
    await this.db
      .update(orderSessions)
      .set({ status: 'paid', updatedAt: new Date() })
      .where(and(eq(orderSessions.id, input.orderSessionId), eq(orderSessions.tenantId, input.tenantId)));
  }

  public async createPaidOrder(input: {
    tenantId: string;
    guildId: string;
    orderSessionId: string;
    providerOrderId: string;
    status: string;
    priceMinor: number;
    currency: string;
    paymentReference: string | null;
  }): Promise<boolean> {
    try {
      await this.db.insert(ordersPaid).values({
        id: ulid(),
        tenantId: input.tenantId,
        guildId: input.guildId,
        orderSessionId: input.orderSessionId,
        wooOrderId: input.providerOrderId,
        status: input.status,
        priceMinor: input.priceMinor,
        currency: input.currency,
        paymentReference: input.paymentReference,
      });
      return true;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'ER_DUP_ENTRY'
      ) {
        return false;
      }

      throw error;
    }
  }

  public async cacheOrderNotes(input: {
    tenantId: string;
    guildId: string;
    orderSessionId: string;
    wooOrderId: string;
    latestInternalNote: string | null;
    latestCustomerNote: string | null;
  }): Promise<void> {
    const existing = await this.db.query.orderNotesCache.findFirst({
      where: eq(orderNotesCache.orderSessionId, input.orderSessionId),
    });

    if (existing) {
      await this.db
        .update(orderNotesCache)
        .set({
          latestInternalNote: input.latestInternalNote,
          latestCustomerNote: input.latestCustomerNote,
          fetchedAt: new Date(),
        })
        .where(eq(orderNotesCache.id, existing.id));
      return;
    }

    await this.db.insert(orderNotesCache).values({
      id: ulid(),
      tenantId: input.tenantId,
      guildId: input.guildId,
      orderSessionId: input.orderSessionId,
      wooOrderId: input.wooOrderId,
      latestInternalNote: input.latestInternalNote,
      latestCustomerNote: input.latestCustomerNote,
    });
  }

  public async createWebhookEvent(input: {
    tenantId: string;
    guildId: string | null;
    provider: 'woocommerce' | 'voodoopay';
    deliveryId: string;
    topic: string;
    signatureValid: boolean;
    payload: Record<string, unknown>;
  }): Promise<{ created: boolean; webhookEventId: string }> {
    const existing = await this.db.query.webhookEvents.findFirst({
      where: and(
        eq(webhookEvents.tenantId, input.tenantId),
        eq(webhookEvents.providerDeliveryId, input.deliveryId),
      ),
    });

    if (existing) {
      return { created: false, webhookEventId: existing.id };
    }

    const webhookEventId = ulid();
    await this.db.insert(webhookEvents).values({
      id: webhookEventId,
      tenantId: input.tenantId,
      guildId: input.guildId,
      provider: input.provider,
      providerDeliveryId: input.deliveryId,
      topic: input.topic,
      signatureValid: input.signatureValid,
      payload: input.payload,
      status: 'received',
      attemptCount: 0,
    });

    return { created: true, webhookEventId };
  }

  public async markWebhookProcessed(webhookEventId: string): Promise<void> {
    await this.db
      .update(webhookEvents)
      .set({
        status: 'processed',
        processedAt: new Date(),
      })
      .where(eq(webhookEvents.id, webhookEventId));
  }

  public async markWebhookFailed(input: {
    webhookEventId: string;
    failureReason: string;
    attemptCount: number;
    nextRetryAt: Date | null;
  }): Promise<void> {
    await this.db
      .update(webhookEvents)
      .set({
        status: 'failed',
        failureReason: input.failureReason,
        attemptCount: input.attemptCount,
        nextRetryAt: input.nextRetryAt,
      })
      .where(eq(webhookEvents.id, input.webhookEventId));
  }

  public async markWebhookDuplicate(webhookEventId: string): Promise<void> {
    await this.db
      .update(webhookEvents)
      .set({
        status: 'duplicate',
        processedAt: new Date(),
      })
      .where(eq(webhookEvents.id, webhookEventId));
  }
}
