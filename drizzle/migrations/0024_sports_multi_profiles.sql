ALTER TABLE `sports_guild_configs`
  CHANGE COLUMN `managed_category_channel_id` `managed_category_channel_id_legacy` varchar(32),
  CHANGE COLUMN `live_category_channel_id` `live_category_channel_id_legacy` varchar(32),
  CHANGE COLUMN `broadcast_country` `broadcast_country_legacy` varchar(120);
--> statement-breakpoint

CREATE TABLE `sports_profiles` (
  `id` varchar(26) NOT NULL,
  `guild_id` varchar(32) NOT NULL,
  `slug` varchar(48) NOT NULL,
  `label` varchar(80) NOT NULL,
  `broadcast_country` varchar(120) NOT NULL,
  `daily_category_channel_id` varchar(32),
  `live_category_channel_id` varchar(32),
  `enabled` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `sports_profiles_pk` PRIMARY KEY (`id`),
  CONSTRAINT `sports_profiles_guild_slug_uq` UNIQUE (`guild_id`, `slug`)
);
--> statement-breakpoint

INSERT INTO `sports_profiles` (
  `id`,
  `guild_id`,
  `slug`,
  `label`,
  `broadcast_country`,
  `daily_category_channel_id`,
  `live_category_channel_id`,
  `enabled`,
  `created_at`,
  `updated_at`
)
SELECT
  `id`,
  `guild_id`,
  'default',
  `broadcast_country_legacy`,
  `broadcast_country_legacy`,
  `managed_category_channel_id_legacy`,
  `live_category_channel_id_legacy`,
  `enabled`,
  `created_at`,
  `updated_at`
FROM `sports_guild_configs`;
--> statement-breakpoint

ALTER TABLE `sports_channel_bindings`
  ADD COLUMN `profile_id` varchar(26) NULL;
--> statement-breakpoint

UPDATE `sports_channel_bindings` AS `bindings`
JOIN `sports_profiles` AS `profiles`
  ON `profiles`.`guild_id` = `bindings`.`guild_id`
 AND `profiles`.`slug` = 'default'
SET `bindings`.`profile_id` = `profiles`.`id`
WHERE `bindings`.`profile_id` IS NULL;
--> statement-breakpoint

ALTER TABLE `sports_channel_bindings`
  MODIFY COLUMN `profile_id` varchar(26) NOT NULL,
  DROP INDEX `sports_channel_bindings_guild_sport_uq`,
  ADD UNIQUE KEY `sports_channel_bindings_profile_sport_uq` (`profile_id`, `sport_name`),
  ADD INDEX `sports_channel_bindings_profile_idx` (`profile_id`);
--> statement-breakpoint

ALTER TABLE `sports_live_event_channels`
  ADD COLUMN `profile_id` varchar(26) NULL;
--> statement-breakpoint

UPDATE `sports_live_event_channels` AS `events`
JOIN `sports_profiles` AS `profiles`
  ON `profiles`.`guild_id` = `events`.`guild_id`
 AND `profiles`.`slug` = 'default'
SET `events`.`profile_id` = `profiles`.`id`
WHERE `events`.`profile_id` IS NULL;
--> statement-breakpoint

ALTER TABLE `sports_live_event_channels`
  MODIFY COLUMN `profile_id` varchar(26) NOT NULL,
  DROP INDEX `sports_live_event_channels_guild_event_uq`,
  ADD UNIQUE KEY `sports_live_event_channels_profile_event_uq` (`profile_id`, `event_id`),
  ADD INDEX `sports_live_event_channels_profile_idx` (`profile_id`);
