CREATE TABLE `ai_answer_correction_contexts` (
  `id` varchar(26) NOT NULL,
  `guild_id` varchar(32) NOT NULL,
  `source_channel_id` varchar(32) NOT NULL,
  `source_message_id` varchar(32) NOT NULL,
  `question` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `ai_answer_correction_contexts_id` PRIMARY KEY(`id`),
  CONSTRAINT `ai_answer_correction_contexts_source_message_uq` UNIQUE(`guild_id`,`source_channel_id`,`source_message_id`)
);
--> statement-breakpoint
CREATE INDEX `ai_answer_correction_contexts_guild_idx` ON `ai_answer_correction_contexts` (`guild_id`);
