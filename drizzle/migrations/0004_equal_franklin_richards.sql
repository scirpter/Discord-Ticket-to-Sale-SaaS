CREATE TABLE `discount_coupons` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`code` varchar(40) NOT NULL,
	`discount_minor` int NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `discount_coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `discount_coupons_tenant_guild_code_uq` UNIQUE(`tenant_id`,`guild_id`,`code`)
);
--> statement-breakpoint
ALTER TABLE `guild_configs` ADD `tip_enabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `order_sessions` ADD `basket_items` json DEFAULT ('[]') NOT NULL;--> statement-breakpoint
ALTER TABLE `order_sessions` ADD `coupon_code` varchar(40);--> statement-breakpoint
ALTER TABLE `order_sessions` ADD `coupon_discount_minor` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `order_sessions` ADD `tip_minor` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `order_sessions` ADD `subtotal_minor` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `order_sessions` ADD `total_minor` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `discount_coupons_tenant_guild_idx` ON `discount_coupons` (`tenant_id`,`guild_id`);--> statement-breakpoint
CREATE INDEX `discount_coupons_tenant_created_idx` ON `discount_coupons` (`tenant_id`,`created_at`);