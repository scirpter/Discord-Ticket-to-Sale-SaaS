ALTER TABLE `guild_configs` ADD COLUMN `join_gate_enabled` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `guild_configs` ADD COLUMN `join_gate_fallback_channel_id` varchar(32);
--> statement-breakpoint
ALTER TABLE `guild_configs` ADD COLUMN `join_gate_verified_role_id` varchar(32);
--> statement-breakpoint
ALTER TABLE `guild_configs` ADD COLUMN `join_gate_ticket_category_id` varchar(32);
--> statement-breakpoint
ALTER TABLE `guild_configs` ADD COLUMN `join_gate_current_lookup_channel_id` varchar(32);
--> statement-breakpoint
ALTER TABLE `guild_configs` ADD COLUMN `join_gate_new_lookup_channel_id` varchar(32);
--> statement-breakpoint
CREATE TABLE `join_gate_members` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`discord_user_id` varchar(32) NOT NULL,
	`status` enum('pending', 'awaiting_email', 'matched', 'verified', 'kicked') NOT NULL DEFAULT 'pending',
	`selected_path` enum('current_customer', 'new_customer'),
	`failed_attempts` int NOT NULL DEFAULT 0,
	`verified_email_normalized` varchar(320),
	`verified_email_display` varchar(320),
	`ticket_channel_id` varchar(32),
	`dm_status` enum('unknown', 'sent', 'blocked', 'failed') NOT NULL DEFAULT 'unknown',
	`joined_at` timestamp NOT NULL DEFAULT (now()),
	`selected_at` timestamp,
	`matched_at` timestamp,
	`verified_at` timestamp,
	`kicked_at` timestamp,
	`dm_sent_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `join_gate_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `join_gate_members_tenant_guild_user_uq` UNIQUE(`tenant_id`,`guild_id`,`discord_user_id`)
);
--> statement-breakpoint
CREATE INDEX `join_gate_members_tenant_guild_status_idx` ON `join_gate_members` (`tenant_id`,`guild_id`,`status`);
--> statement-breakpoint
CREATE INDEX `join_gate_members_tenant_guild_idx` ON `join_gate_members` (`tenant_id`,`guild_id`);
--> statement-breakpoint
CREATE TABLE `join_gate_email_index` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`lookup_type` enum('current_customer', 'new_customer') NOT NULL,
	`source_channel_id` varchar(32) NOT NULL,
	`source_message_id` varchar(32) NOT NULL,
	`email_normalized` varchar(320) NOT NULL,
	`email_display` varchar(320) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `join_gate_email_index_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `join_gate_email_index_tenant_guild_type_message_email_uq` ON `join_gate_email_index` (`tenant_id`,`guild_id`,`lookup_type`,`source_message_id`,`email_normalized`);
--> statement-breakpoint
CREATE INDEX `join_gate_email_index_lookup_email_idx` ON `join_gate_email_index` (`tenant_id`,`guild_id`,`lookup_type`,`email_normalized`);
--> statement-breakpoint
CREATE INDEX `join_gate_email_index_message_idx` ON `join_gate_email_index` (`source_channel_id`,`source_message_id`);
--> statement-breakpoint
CREATE INDEX `join_gate_email_index_tenant_guild_idx` ON `join_gate_email_index` (`tenant_id`,`guild_id`);
