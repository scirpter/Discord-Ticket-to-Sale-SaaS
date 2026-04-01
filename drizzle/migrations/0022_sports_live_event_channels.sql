CREATE TABLE `sports_live_event_channels` (
  `id` varchar(26) NOT NULL,
  `guild_id` varchar(32) NOT NULL,
  `sport_name` varchar(80) NOT NULL,
  `event_id` varchar(32) NOT NULL,
  `event_name` varchar(160) NOT NULL,
  `sport_channel_id` varchar(32) NOT NULL,
  `event_channel_id` varchar(32),
  `status` enum('scheduled','live','finished','cleanup_due','deleted','failed') NOT NULL DEFAULT 'scheduled',
  `kickoff_at_utc` timestamp NOT NULL,
  `last_score_snapshot` json,
  `last_state_snapshot` json,
  `last_synced_at_utc` timestamp,
  `finished_at_utc` timestamp,
  `delete_after_utc` timestamp,
  `highlights_posted` boolean NOT NULL DEFAULT false,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `sports_live_event_channels_id` PRIMARY KEY(`id`),
  CONSTRAINT `sports_live_event_channels_guild_event_uq` UNIQUE(`guild_id`,`event_id`),
  CONSTRAINT `sports_live_event_channels_guild_event_channel_uq` UNIQUE(`guild_id`,`event_channel_id`)
);
--> statement-breakpoint
CREATE INDEX `sports_live_event_channels_status_sync_idx` ON `sports_live_event_channels` (`status`,`last_synced_at_utc`);--> statement-breakpoint
CREATE INDEX `sports_live_event_channels_status_delete_idx` ON `sports_live_event_channels` (`status`,`delete_after_utc`);--> statement-breakpoint
CREATE INDEX `sports_live_event_channels_guild_idx` ON `sports_live_event_channels` (`guild_id`);
