CREATE TABLE `customer_points_accounts` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`email_normalized` varchar(320) NOT NULL,
	`email_display` varchar(320) NOT NULL,
	`balance_points` int NOT NULL DEFAULT 0,
	`reserved_points` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_points_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_points_accounts_tenant_guild_email_uq` UNIQUE(`tenant_id`,`guild_id`,`email_normalized`)
);
--> statement-breakpoint
CREATE TABLE `customer_points_ledger` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`email_normalized` varchar(320) NOT NULL,
	`delta_points` int NOT NULL,
	`event_type` varchar(48) NOT NULL,
	`order_session_id` varchar(26),
	`actor_user_id` varchar(26),
	`metadata` json NOT NULL DEFAULT ('{}'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_points_ledger_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `guild_configs` ADD `points_earn_category_keys` json DEFAULT ('[]') NOT NULL;--> statement-breakpoint
ALTER TABLE `guild_configs` ADD `points_redeem_category_keys` json DEFAULT ('[]') NOT NULL;--> statement-breakpoint
ALTER TABLE `guild_configs` ADD `point_value_minor` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `order_sessions` ADD `customer_email_normalized` varchar(320);--> statement-breakpoint
ALTER TABLE `order_sessions` ADD `points_reserved` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `order_sessions` ADD `points_discount_minor` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `order_sessions` ADD `points_reservation_state` enum('none','reserved','released_expired','released_cancelled','consumed') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_sessions` ADD `points_config_snapshot` json DEFAULT ('{"pointValueMinor":1,"earnCategoryKeys":[],"redeemCategoryKeys":[]}') NOT NULL;--> statement-breakpoint
CREATE INDEX `customer_points_accounts_tenant_guild_idx` ON `customer_points_accounts` (`tenant_id`,`guild_id`);--> statement-breakpoint
CREATE INDEX `customer_points_accounts_tenant_created_idx` ON `customer_points_accounts` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `customer_points_ledger_tenant_guild_idx` ON `customer_points_ledger` (`tenant_id`,`guild_id`);--> statement-breakpoint
CREATE INDEX `customer_points_ledger_order_session_idx` ON `customer_points_ledger` (`order_session_id`);--> statement-breakpoint
CREATE INDEX `customer_points_ledger_tenant_created_idx` ON `customer_points_ledger` (`tenant_id`,`created_at`);