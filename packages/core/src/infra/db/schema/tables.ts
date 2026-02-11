import {
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

import type { FormFieldValidation, TenantMemberRole } from '../../../domain/types.js';

export const users = mysqlTable(
  'users',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    discordUserId: varchar('discord_user_id', { length: 32 }).notNull(),
    username: varchar('username', { length: 100 }).notNull(),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    discordUserIdUnique: uniqueIndex('users_discord_user_id_uq').on(table.discordUserId),
  }),
);

export const superAdmins = mysqlTable(
  'super_admins',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    userId: varchar('user_id', { length: 26 }).notNull(),
    discordUserId: varchar('discord_user_id', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    discordUserIdUnique: uniqueIndex('super_admins_discord_user_id_uq').on(table.discordUserId),
    userIdUnique: uniqueIndex('super_admins_user_id_uq').on(table.userId),
  }),
);

export const tenants = mysqlTable(
  'tenants',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    status: mysqlEnum('status', ['active', 'disabled']).notNull().default('active'),
    ownerUserId: varchar('owner_user_id', { length: 26 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index('tenants_status_idx').on(table.status),
    createdAtIdx: index('tenants_created_at_idx').on(table.createdAt),
  }),
);

export const tenantMembers = mysqlTable(
  'tenant_members',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 26 }).notNull(),
    userId: varchar('user_id', { length: 26 }).notNull(),
    role: mysqlEnum('role', ['owner', 'admin', 'member']).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    tenantUserUnique: uniqueIndex('tenant_members_tenant_user_uq').on(table.tenantId, table.userId),
    tenantIdx: index('tenant_members_tenant_idx').on(table.tenantId),
  }),
);

export const tenantGuilds = mysqlTable(
  'tenant_guilds',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 26 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    guildName: varchar('guild_name', { length: 120 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    tenantGuildUnique: uniqueIndex('tenant_guilds_tenant_guild_uq').on(table.tenantId, table.guildId),
    tenantGuildIdx: index('tenant_guilds_tenant_guild_idx').on(table.tenantId, table.guildId),
    tenantCreatedIdx: index('tenant_guilds_tenant_created_idx').on(table.tenantId, table.createdAt),
  }),
);

export const guildConfigs = mysqlTable(
  'guild_configs',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 26 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    paidLogChannelId: varchar('paid_log_channel_id', { length: 32 }),
    staffRoleIds: json('staff_role_ids').$type<string[]>().notNull().default([]),
    defaultCurrency: varchar('default_currency', { length: 3 }).notNull().default('USD'),
    ticketMetadataKey: varchar('ticket_metadata_key', { length: 64 }).notNull().default('isTicket'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    tenantGuildUnique: uniqueIndex('guild_configs_tenant_guild_uq').on(table.tenantId, table.guildId),
    tenantGuildIdx: index('guild_configs_tenant_guild_idx').on(table.tenantId, table.guildId),
    tenantCreatedIdx: index('guild_configs_tenant_created_idx').on(table.tenantId, table.createdAt),
  }),
);

export const products = mysqlTable(
  'products',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 26 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    category: varchar('category', { length: 80 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    tenantGuildIdx: index('products_tenant_guild_idx').on(table.tenantId, table.guildId),
    tenantCreatedIdx: index('products_tenant_created_idx').on(table.tenantId, table.createdAt),
  }),
);

export const productVariants = mysqlTable(
  'product_variants',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 26 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    productId: varchar('product_id', { length: 26 }).notNull(),
    label: varchar('label', { length: 80 }).notNull(),
    priceMinor: int('price_minor').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    wooProductId: varchar('woo_product_id', { length: 64 }),
    wooCheckoutPath: varchar('woo_checkout_path', { length: 255 }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    tenantGuildIdx: index('product_variants_tenant_guild_idx').on(table.tenantId, table.guildId),
    productIdx: index('product_variants_product_idx').on(table.productId),
    tenantCreatedIdx: index('product_variants_tenant_created_idx').on(table.tenantId, table.createdAt),
  }),
);

export const productFormFields = mysqlTable(
  'product_form_fields',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 26 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    productId: varchar('product_id', { length: 26 }).notNull(),
    fieldKey: varchar('field_key', { length: 64 }).notNull(),
    label: varchar('label', { length: 120 }).notNull(),
    fieldType: mysqlEnum('field_type', ['short_text', 'long_text', 'email', 'number']).notNull(),
    required: boolean('required').notNull().default(true),
    sensitive: boolean('sensitive').notNull().default(false),
    sortOrder: int('sort_order').notNull(),
    validation: json('validation').$type<FormFieldValidation | null>(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    productFieldUnique: uniqueIndex('product_form_fields_product_field_uq').on(
      table.productId,
      table.fieldKey,
    ),
    tenantGuildIdx: index('product_form_fields_tenant_guild_idx').on(table.tenantId, table.guildId),
    productSortIdx: index('product_form_fields_product_sort_idx').on(table.productId, table.sortOrder),
    tenantCreatedIdx: index('product_form_fields_tenant_created_idx').on(table.tenantId, table.createdAt),
  }),
);

export const tenantIntegrationsWoo = mysqlTable(
  'tenant_integrations_woo',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 26 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    wpBaseUrl: varchar('wp_base_url', { length: 255 }).notNull(),
    tenantWebhookKey: varchar('tenant_webhook_key', { length: 64 }).notNull(),
    webhookSecretEncrypted: text('webhook_secret_encrypted').notNull(),
    consumerKeyEncrypted: text('consumer_key_encrypted').notNull(),
    consumerSecretEncrypted: text('consumer_secret_encrypted').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    tenantGuildUnique: uniqueIndex('tenant_integrations_woo_tenant_guild_uq').on(
      table.tenantId,
      table.guildId,
    ),
    webhookKeyUnique: uniqueIndex('tenant_integrations_woo_webhook_key_uq').on(table.tenantWebhookKey),
    tenantGuildIdx: index('tenant_integrations_woo_tenant_guild_idx').on(table.tenantId, table.guildId),
    tenantCreatedIdx: index('tenant_integrations_woo_tenant_created_idx').on(table.tenantId, table.createdAt),
  }),
);

export const orderSessions = mysqlTable(
  'order_sessions',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 26 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    ticketChannelId: varchar('ticket_channel_id', { length: 32 }).notNull(),
    staffUserId: varchar('staff_user_id', { length: 32 }).notNull(),
    customerDiscordId: varchar('customer_discord_id', { length: 32 }).notNull(),
    productId: varchar('product_id', { length: 26 }).notNull(),
    variantId: varchar('variant_id', { length: 26 }).notNull(),
    status: mysqlEnum('status', ['pending_payment', 'cancelled', 'paid'])
      .notNull()
      .default('pending_payment'),
    answers: json('answers').$type<Record<string, string>>().notNull().default({}),
    checkoutTokenExpiresAt: timestamp('checkout_token_expires_at', { mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    tenantGuildIdx: index('order_sessions_tenant_guild_idx').on(table.tenantId, table.guildId),
    ticketChannelIdx: index('order_sessions_ticket_channel_idx').on(table.ticketChannelId),
    tenantCreatedIdx: index('order_sessions_tenant_created_idx').on(table.tenantId, table.createdAt),
  }),
);

export const ordersPaid = mysqlTable(
  'orders_paid',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 26 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    orderSessionId: varchar('order_session_id', { length: 26 }).notNull(),
    wooOrderId: varchar('woo_order_id', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    priceMinor: int('price_minor').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    paymentReference: varchar('payment_reference', { length: 120 }),
    paidAt: timestamp('paid_at', { mode: 'date' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    orderSessionUnique: uniqueIndex('orders_paid_order_session_uq').on(table.orderSessionId),
    tenantGuildIdx: index('orders_paid_tenant_guild_idx').on(table.tenantId, table.guildId),
    tenantCreatedIdx: index('orders_paid_tenant_created_idx').on(table.tenantId, table.createdAt),
  }),
);

export const orderNotesCache = mysqlTable(
  'order_notes_cache',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 26 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    orderSessionId: varchar('order_session_id', { length: 26 }).notNull(),
    wooOrderId: varchar('woo_order_id', { length: 64 }).notNull(),
    latestInternalNote: text('latest_internal_note'),
    latestCustomerNote: text('latest_customer_note'),
    fetchedAt: timestamp('fetched_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    orderSessionUnique: uniqueIndex('order_notes_cache_order_session_uq').on(table.orderSessionId),
    tenantGuildIdx: index('order_notes_cache_tenant_guild_idx').on(table.tenantId, table.guildId),
    tenantCreatedIdx: index('order_notes_cache_tenant_fetched_idx').on(table.tenantId, table.fetchedAt),
  }),
);

export const webhookEvents = mysqlTable(
  'webhook_events',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 26 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }),
    provider: mysqlEnum('provider', ['woocommerce']).notNull().default('woocommerce'),
    providerDeliveryId: varchar('provider_delivery_id', { length: 80 }).notNull(),
    topic: varchar('topic', { length: 120 }).notNull(),
    signatureValid: boolean('signature_valid').notNull(),
    payload: json('payload').$type<Record<string, unknown>>().notNull(),
    status: mysqlEnum('status', ['received', 'processed', 'failed', 'duplicate'])
      .notNull()
      .default('received'),
    attemptCount: int('attempt_count').notNull().default(0),
    failureReason: text('failure_reason'),
    nextRetryAt: timestamp('next_retry_at', { mode: 'date' }),
    processedAt: timestamp('processed_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    tenantDeliveryUnique: uniqueIndex('webhook_events_tenant_delivery_uq').on(
      table.tenantId,
      table.providerDeliveryId,
    ),
    tenantGuildIdx: index('webhook_events_tenant_guild_idx').on(table.tenantId, table.guildId),
    tenantCreatedIdx: index('webhook_events_tenant_created_idx').on(table.tenantId, table.createdAt),
  }),
);

export const auditLogs = mysqlTable(
  'audit_logs',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 26 }),
    userId: varchar('user_id', { length: 26 }),
    actorDiscordUserId: varchar('actor_discord_user_id', { length: 32 }),
    action: varchar('action', { length: 120 }).notNull(),
    resourceType: varchar('resource_type', { length: 80 }).notNull(),
    resourceId: varchar('resource_id', { length: 64 }),
    correlationId: varchar('correlation_id', { length: 26 }).notNull(),
    metadata: json('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    tenantCreatedIdx: index('audit_logs_tenant_created_idx').on(table.tenantId, table.createdAt),
    actionIdx: index('audit_logs_action_idx').on(table.action),
  }),
);

export const appSecrets = mysqlTable(
  'app_secrets',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    secretKey: varchar('secret_key', { length: 80 }).notNull(),
    valueEncrypted: text('value_encrypted').notNull(),
    rotatedAt: timestamp('rotated_at', { mode: 'date' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    secretKeyUnique: uniqueIndex('app_secrets_secret_key_uq').on(table.secretKey),
  }),
);

export const ticketChannelMetadata = mysqlTable(
  'ticket_channel_metadata',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 26 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    channelId: varchar('channel_id', { length: 32 }).notNull(),
    isTicket: boolean('is_ticket').notNull().default(true),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    tenantChannelUnique: uniqueIndex('ticket_channel_metadata_tenant_channel_uq').on(
      table.tenantId,
      table.guildId,
      table.channelId,
    ),
    tenantGuildIdx: index('ticket_channel_metadata_tenant_guild_idx').on(table.tenantId, table.guildId),
  }),
);

export type TenantMemberRoleValue = TenantMemberRole;
