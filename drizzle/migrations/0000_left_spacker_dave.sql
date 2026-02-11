CREATE TABLE `app_secrets` (
	`id` varchar(26) NOT NULL,
	`secret_key` varchar(80) NOT NULL,
	`value_encrypted` text NOT NULL,
	`rotated_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `app_secrets_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_secrets_secret_key_uq` UNIQUE(`secret_key`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26),
	`user_id` varchar(26),
	`actor_discord_user_id` varchar(32),
	`action` varchar(120) NOT NULL,
	`resource_type` varchar(80) NOT NULL,
	`resource_id` varchar(64),
	`correlation_id` varchar(26) NOT NULL,
	`metadata` json NOT NULL DEFAULT ('{}'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `guild_configs` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`paid_log_channel_id` varchar(32),
	`staff_role_ids` json NOT NULL DEFAULT ('[]'),
	`default_currency` varchar(3) NOT NULL DEFAULT 'USD',
	`ticket_metadata_key` varchar(64) NOT NULL DEFAULT 'isTicket',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `guild_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `guild_configs_tenant_guild_uq` UNIQUE(`tenant_id`,`guild_id`)
);
--> statement-breakpoint
CREATE TABLE `order_notes_cache` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`order_session_id` varchar(26) NOT NULL,
	`woo_order_id` varchar(64) NOT NULL,
	`latest_internal_note` text,
	`latest_customer_note` text,
	`fetched_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_notes_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_notes_cache_order_session_uq` UNIQUE(`order_session_id`)
);
--> statement-breakpoint
CREATE TABLE `order_sessions` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`ticket_channel_id` varchar(32) NOT NULL,
	`staff_user_id` varchar(32) NOT NULL,
	`customer_discord_id` varchar(32) NOT NULL,
	`product_id` varchar(26) NOT NULL,
	`variant_id` varchar(26) NOT NULL,
	`status` enum('pending_payment','cancelled','paid') NOT NULL DEFAULT 'pending_payment',
	`answers` json NOT NULL DEFAULT ('{}'),
	`checkout_token_expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders_paid` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`order_session_id` varchar(26) NOT NULL,
	`woo_order_id` varchar(64) NOT NULL,
	`status` varchar(32) NOT NULL,
	`price_minor` int NOT NULL,
	`currency` varchar(3) NOT NULL,
	`payment_reference` varchar(120),
	`paid_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orders_paid_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_paid_order_session_uq` UNIQUE(`order_session_id`)
);
--> statement-breakpoint
CREATE TABLE `product_form_fields` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`product_id` varchar(26) NOT NULL,
	`field_key` varchar(64) NOT NULL,
	`label` varchar(120) NOT NULL,
	`field_type` enum('short_text','long_text','email','number') NOT NULL,
	`required` boolean NOT NULL DEFAULT true,
	`sensitive` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL,
	`validation` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_form_fields_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_form_fields_product_field_uq` UNIQUE(`product_id`,`field_key`)
);
--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`product_id` varchar(26) NOT NULL,
	`label` varchar(80) NOT NULL,
	`price_minor` int NOT NULL,
	`currency` varchar(3) NOT NULL,
	`woo_product_id` varchar(64),
	`woo_checkout_path` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_variants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`category` varchar(80) NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `super_admins` (
	`id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`discord_user_id` varchar(32) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `super_admins_id` PRIMARY KEY(`id`),
	CONSTRAINT `super_admins_discord_user_id_uq` UNIQUE(`discord_user_id`),
	CONSTRAINT `super_admins_user_id_uq` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `tenant_guilds` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`guild_name` varchar(120) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenant_guilds_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_guilds_tenant_guild_uq` UNIQUE(`tenant_id`,`guild_id`)
);
--> statement-breakpoint
CREATE TABLE `tenant_integrations_woo` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`wp_base_url` varchar(255) NOT NULL,
	`tenant_webhook_key` varchar(64) NOT NULL,
	`webhook_secret_encrypted` text NOT NULL,
	`consumer_key_encrypted` text NOT NULL,
	`consumer_secret_encrypted` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenant_integrations_woo_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_integrations_woo_tenant_guild_uq` UNIQUE(`tenant_id`,`guild_id`),
	CONSTRAINT `tenant_integrations_woo_webhook_key_uq` UNIQUE(`tenant_webhook_key`)
);
--> statement-breakpoint
CREATE TABLE `tenant_members` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`role` enum('owner','admin','member') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenant_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_members_tenant_user_uq` UNIQUE(`tenant_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` varchar(26) NOT NULL,
	`name` varchar(120) NOT NULL,
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`owner_user_id` varchar(26) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ticket_channel_metadata` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`channel_id` varchar(32) NOT NULL,
	`is_ticket` boolean NOT NULL DEFAULT true,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ticket_channel_metadata_id` PRIMARY KEY(`id`),
	CONSTRAINT `ticket_channel_metadata_tenant_channel_uq` UNIQUE(`tenant_id`,`guild_id`,`channel_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(26) NOT NULL,
	`discord_user_id` varchar(32) NOT NULL,
	`username` varchar(100) NOT NULL,
	`avatar_url` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_discord_user_id_uq` UNIQUE(`discord_user_id`)
);
--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32),
	`provider` enum('woocommerce') NOT NULL DEFAULT 'woocommerce',
	`provider_delivery_id` varchar(80) NOT NULL,
	`topic` varchar(120) NOT NULL,
	`signature_valid` boolean NOT NULL,
	`payload` json NOT NULL,
	`status` enum('received','processed','failed','duplicate') NOT NULL DEFAULT 'received',
	`attempt_count` int NOT NULL DEFAULT 0,
	`failure_reason` text,
	`next_retry_at` timestamp,
	`processed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `webhook_events_tenant_delivery_uq` UNIQUE(`tenant_id`,`provider_delivery_id`)
);
--> statement-breakpoint
CREATE INDEX `audit_logs_tenant_created_idx` ON `audit_logs` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_action_idx` ON `audit_logs` (`action`);--> statement-breakpoint
CREATE INDEX `guild_configs_tenant_guild_idx` ON `guild_configs` (`tenant_id`,`guild_id`);--> statement-breakpoint
CREATE INDEX `guild_configs_tenant_created_idx` ON `guild_configs` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `order_notes_cache_tenant_guild_idx` ON `order_notes_cache` (`tenant_id`,`guild_id`);--> statement-breakpoint
CREATE INDEX `order_notes_cache_tenant_fetched_idx` ON `order_notes_cache` (`tenant_id`,`fetched_at`);--> statement-breakpoint
CREATE INDEX `order_sessions_tenant_guild_idx` ON `order_sessions` (`tenant_id`,`guild_id`);--> statement-breakpoint
CREATE INDEX `order_sessions_ticket_channel_idx` ON `order_sessions` (`ticket_channel_id`);--> statement-breakpoint
CREATE INDEX `order_sessions_tenant_created_idx` ON `order_sessions` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_paid_tenant_guild_idx` ON `orders_paid` (`tenant_id`,`guild_id`);--> statement-breakpoint
CREATE INDEX `orders_paid_tenant_created_idx` ON `orders_paid` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `product_form_fields_tenant_guild_idx` ON `product_form_fields` (`tenant_id`,`guild_id`);--> statement-breakpoint
CREATE INDEX `product_form_fields_product_sort_idx` ON `product_form_fields` (`product_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `product_form_fields_tenant_created_idx` ON `product_form_fields` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `product_variants_tenant_guild_idx` ON `product_variants` (`tenant_id`,`guild_id`);--> statement-breakpoint
CREATE INDEX `product_variants_product_idx` ON `product_variants` (`product_id`);--> statement-breakpoint
CREATE INDEX `product_variants_tenant_created_idx` ON `product_variants` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `products_tenant_guild_idx` ON `products` (`tenant_id`,`guild_id`);--> statement-breakpoint
CREATE INDEX `products_tenant_created_idx` ON `products` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `tenant_guilds_tenant_guild_idx` ON `tenant_guilds` (`tenant_id`,`guild_id`);--> statement-breakpoint
CREATE INDEX `tenant_guilds_tenant_created_idx` ON `tenant_guilds` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `tenant_integrations_woo_tenant_guild_idx` ON `tenant_integrations_woo` (`tenant_id`,`guild_id`);--> statement-breakpoint
CREATE INDEX `tenant_integrations_woo_tenant_created_idx` ON `tenant_integrations_woo` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `tenant_members_tenant_idx` ON `tenant_members` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `tenants_status_idx` ON `tenants` (`status`);--> statement-breakpoint
CREATE INDEX `tenants_created_at_idx` ON `tenants` (`created_at`);--> statement-breakpoint
CREATE INDEX `ticket_channel_metadata_tenant_guild_idx` ON `ticket_channel_metadata` (`tenant_id`,`guild_id`);--> statement-breakpoint
CREATE INDEX `webhook_events_tenant_guild_idx` ON `webhook_events` (`tenant_id`,`guild_id`);--> statement-breakpoint
CREATE INDEX `webhook_events_tenant_created_idx` ON `webhook_events` (`tenant_id`,`created_at`);