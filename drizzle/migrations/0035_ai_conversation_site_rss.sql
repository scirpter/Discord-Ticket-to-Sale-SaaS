ALTER TABLE `ai_website_sources`
  ADD COLUMN `source_type` enum('website','rss_feed') NOT NULL DEFAULT 'website',
  ADD COLUMN `crawl_mode` enum('page','site') NOT NULL DEFAULT 'page',
  ADD COLUMN `document_count` int NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `ai_conversation_turns` (
  `id` varchar(26) NOT NULL,
  `guild_id` varchar(32) NOT NULL,
  `channel_id` varchar(32) NOT NULL,
  `discord_user_id` varchar(32) NOT NULL,
  `user_message_id` varchar(32) NOT NULL,
  `bot_message_id` varchar(32),
  `user_content` text NOT NULL,
  `bot_content` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `ai_conversation_turns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ai_conversation_turns_scope_created_idx` ON `ai_conversation_turns` (`guild_id`,`channel_id`,`discord_user_id`,`created_at`);
