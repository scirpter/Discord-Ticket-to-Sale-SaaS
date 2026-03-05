CREATE TABLE `channel_nuke_locks` (
	`lock_key` varchar(96) NOT NULL,
	`owner_id` varchar(64) NOT NULL,
	`lease_until` timestamp NOT NULL,
	`heartbeat_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `channel_nuke_locks_lock_key` PRIMARY KEY(`lock_key`)
);
--> statement-breakpoint
CREATE TABLE `channel_nuke_runs` (
	`id` varchar(26) NOT NULL,
	`schedule_id` varchar(26),
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`channel_id` varchar(32) NOT NULL,
	`trigger_type` enum('scheduled','manual','retry') NOT NULL,
	`idempotency_key` varchar(160) NOT NULL,
	`status` enum('queued','running','success','partial','failed','skipped') NOT NULL DEFAULT 'queued',
	`attempt` int NOT NULL DEFAULT 0,
	`old_channel_id` varchar(32),
	`new_channel_id` varchar(32),
	`error_message` text,
	`actor_discord_user_id` varchar(32),
	`correlation_id` varchar(26) NOT NULL,
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`finished_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `channel_nuke_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `channel_nuke_runs_idempotency_uq` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `channel_nuke_schedules` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`channel_id` varchar(32) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`local_time_hhmm` varchar(5) NOT NULL,
	`timezone` varchar(64) NOT NULL,
	`next_run_at_utc` timestamp NOT NULL,
	`last_run_at_utc` timestamp,
	`last_local_run_date` varchar(10),
	`consecutive_failures` int NOT NULL DEFAULT 0,
	`updated_by_discord_user_id` varchar(32),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `channel_nuke_schedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `channel_nuke_schedules_tenant_guild_channel_uq` UNIQUE(`tenant_id`,`guild_id`,`channel_id`)
);
--> statement-breakpoint
ALTER TABLE `webhook_events` DROP INDEX `webhook_events_tenant_delivery_uq`;--> statement-breakpoint
ALTER TABLE `order_sessions` ADD `checkout_url_crypto` text;--> statement-breakpoint
ALTER TABLE `tenant_integrations_voodoo_pay` ADD `crypto_gateway_enabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tenant_integrations_voodoo_pay` ADD `crypto_add_fees` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tenant_integrations_voodoo_pay` ADD `crypto_wallet_evm` varchar(191);--> statement-breakpoint
ALTER TABLE `tenant_integrations_voodoo_pay` ADD `crypto_wallet_btc` varchar(191);--> statement-breakpoint
ALTER TABLE `tenant_integrations_voodoo_pay` ADD `crypto_wallet_bitcoincash` varchar(191);--> statement-breakpoint
ALTER TABLE `tenant_integrations_voodoo_pay` ADD `crypto_wallet_ltc` varchar(191);--> statement-breakpoint
ALTER TABLE `tenant_integrations_voodoo_pay` ADD `crypto_wallet_doge` varchar(191);--> statement-breakpoint
ALTER TABLE `tenant_integrations_voodoo_pay` ADD `crypto_wallet_trc20` varchar(191);--> statement-breakpoint
ALTER TABLE `tenant_integrations_voodoo_pay` ADD `crypto_wallet_solana` varchar(191);--> statement-breakpoint
ALTER TABLE `webhook_events` ADD CONSTRAINT `webhook_events_tenant_provider_delivery_uq` UNIQUE(`tenant_id`,`provider`,`provider_delivery_id`);--> statement-breakpoint
CREATE INDEX `channel_nuke_locks_lease_until_idx` ON `channel_nuke_locks` (`lease_until`);--> statement-breakpoint
CREATE INDEX `channel_nuke_runs_schedule_idx` ON `channel_nuke_runs` (`schedule_id`);--> statement-breakpoint
CREATE INDEX `channel_nuke_runs_tenant_created_idx` ON `channel_nuke_runs` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `channel_nuke_schedules_enabled_next_run_idx` ON `channel_nuke_schedules` (`enabled`,`next_run_at_utc`);--> statement-breakpoint
CREATE INDEX `channel_nuke_schedules_tenant_guild_idx` ON `channel_nuke_schedules` (`tenant_id`,`guild_id`);