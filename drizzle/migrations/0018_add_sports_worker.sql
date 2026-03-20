CREATE TABLE `sports_authorized_users` (
	`id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`discord_user_id` varchar(32) NOT NULL,
	`granted_by_discord_user_id` varchar(32),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sports_authorized_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `sports_authorized_users_guild_user_uq` UNIQUE(`guild_id`,`discord_user_id`)
);
--> statement-breakpoint
CREATE TABLE `sports_channel_bindings` (
	`id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`sport_id` varchar(16),
	`sport_name` varchar(80) NOT NULL,
	`sport_slug` varchar(100) NOT NULL,
	`channel_id` varchar(32) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sports_channel_bindings_id` PRIMARY KEY(`id`),
	CONSTRAINT `sports_channel_bindings_guild_sport_uq` UNIQUE(`guild_id`,`sport_name`),
	CONSTRAINT `sports_channel_bindings_guild_channel_uq` UNIQUE(`guild_id`,`channel_id`)
);
--> statement-breakpoint
CREATE TABLE `sports_guild_configs` (
	`id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`managed_category_channel_id` varchar(32),
	`local_time_hhmm` varchar(5) NOT NULL,
	`timezone` varchar(64) NOT NULL,
	`broadcast_country` varchar(120) NOT NULL,
	`next_run_at_utc` timestamp NOT NULL,
	`last_run_at_utc` timestamp,
	`last_local_run_date` varchar(10),
	`updated_by_discord_user_id` varchar(32),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sports_guild_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `sports_guild_configs_guild_uq` UNIQUE(`guild_id`)
);
--> statement-breakpoint
CREATE INDEX `sports_authorized_users_guild_idx` ON `sports_authorized_users` (`guild_id`);
--> statement-breakpoint
CREATE INDEX `sports_channel_bindings_guild_idx` ON `sports_channel_bindings` (`guild_id`);
--> statement-breakpoint
CREATE INDEX `sports_guild_configs_enabled_next_run_idx` ON `sports_guild_configs` (`enabled`,`next_run_at_utc`);
