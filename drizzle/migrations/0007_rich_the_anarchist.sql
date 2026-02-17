ALTER TABLE `guild_configs` ADD `referral_reward_category_keys` json DEFAULT ('[]') NOT NULL;--> statement-breakpoint
ALTER TABLE `product_variants` ADD `referral_reward_minor` int DEFAULT 0 NOT NULL;