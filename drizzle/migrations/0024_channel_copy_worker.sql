CREATE TABLE `channel_copy_authorized_users` (
  `id` varchar(26) NOT NULL,
  `guild_id` varchar(32) NOT NULL,
  `discord_user_id` varchar(32) NOT NULL,
  `granted_by_discord_user_id` varchar(32) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `channel_copy_authorized_users_id` PRIMARY KEY(`id`),
  CONSTRAINT `channel_copy_authorized_users_guild_user_uq` UNIQUE(`guild_id`,`discord_user_id`)
);
--> statement-breakpoint
CREATE TABLE `channel_copy_jobs` (
  `id` varchar(26) NOT NULL,
  `destination_guild_id` varchar(32) NOT NULL,
  `source_guild_id` varchar(32) NOT NULL,
  `source_channel_id` varchar(32) NOT NULL,
  `destination_channel_id` varchar(32) NOT NULL,
  `requested_by_discord_user_id` varchar(32) NOT NULL,
  `confirm_token` varchar(64) NOT NULL,
  `status` enum('awaiting_confirmation','queued','running','completed','failed') NOT NULL DEFAULT 'awaiting_confirmation',
  `force_confirmed` boolean NOT NULL DEFAULT false,
  `started_at` timestamp,
  `finished_at` timestamp,
  `last_processed_source_message_id` varchar(32),
  `scanned_message_count` int NOT NULL DEFAULT 0,
  `copied_message_count` int NOT NULL DEFAULT 0,
  `skipped_message_count` int NOT NULL DEFAULT 0,
  `failure_message` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `channel_copy_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `channel_copy_authorized_users_guild_idx` ON `channel_copy_authorized_users` (`guild_id`);
--> statement-breakpoint
CREATE INDEX `channel_copy_jobs_destination_guild_created_idx` ON `channel_copy_jobs` (`destination_guild_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `channel_copy_jobs_status_updated_idx` ON `channel_copy_jobs` (`status`,`updated_at`);
