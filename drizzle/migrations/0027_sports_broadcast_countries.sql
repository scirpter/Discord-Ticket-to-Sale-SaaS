ALTER TABLE `sports_guild_configs`
  ADD COLUMN `broadcast_countries` json;
--> statement-breakpoint
UPDATE `sports_guild_configs`
SET `broadcast_countries` = JSON_ARRAY(`broadcast_country`)
WHERE `broadcast_countries` IS NULL;
--> statement-breakpoint
ALTER TABLE `sports_guild_configs`
  MODIFY COLUMN `broadcast_countries` json NOT NULL;
--> statement-breakpoint
ALTER TABLE `sports_live_event_channels`
  ADD COLUMN `score_message_id` varchar(32);
