CREATE TABLE `tenant_integrations_voodoo_pay` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`merchant_wallet_address` varchar(128) NOT NULL,
	`checkout_domain` varchar(120) NOT NULL DEFAULT 'checkout.voodoo-pay.uk',
	`tenant_webhook_key` varchar(64) NOT NULL,
	`callback_secret_encrypted` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenant_integrations_voodoo_pay_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_integrations_voodoo_pay_tenant_guild_uq` UNIQUE(`tenant_id`,`guild_id`),
	CONSTRAINT `tenant_integrations_voodoo_pay_webhook_key_uq` UNIQUE(`tenant_webhook_key`)
);
--> statement-breakpoint
ALTER TABLE `webhook_events` MODIFY COLUMN `provider` enum('woocommerce','voodoopay') NOT NULL DEFAULT 'woocommerce';--> statement-breakpoint
CREATE INDEX `tenant_integrations_voodoo_pay_tenant_guild_idx` ON `tenant_integrations_voodoo_pay` (`tenant_id`,`guild_id`);--> statement-breakpoint
CREATE INDEX `tenant_integrations_voodoo_pay_tenant_created_idx` ON `tenant_integrations_voodoo_pay` (`tenant_id`,`created_at`);