CREATE TABLE `customer_first_paid_orders` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`referred_email_normalized` varchar(320) NOT NULL,
	`first_order_session_id` varchar(26) NOT NULL,
	`first_paid_at` timestamp NOT NULL DEFAULT (now()),
	`claim_id` varchar(26),
	`reward_applied` boolean NOT NULL DEFAULT false,
	`reward_points` int NOT NULL DEFAULT 0,
	`referral_reward_minor_snapshot` int NOT NULL DEFAULT 0,
	`point_value_minor_snapshot` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_first_paid_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `first_paid_orders_tenant_guild_referred_email_uq` UNIQUE(`tenant_id`,`guild_id`,`referred_email_normalized`)
);
--> statement-breakpoint
CREATE TABLE `referral_claims` (
	`id` varchar(26) NOT NULL,
	`tenant_id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`referrer_discord_user_id` varchar(32) NOT NULL,
	`referrer_email_normalized` varchar(320) NOT NULL,
	`referrer_email_display` varchar(320) NOT NULL,
	`referred_email_normalized` varchar(320) NOT NULL,
	`referred_email_display` varchar(320) NOT NULL,
	`status` enum('active','rewarded') NOT NULL DEFAULT 'active',
	`reward_order_session_id` varchar(26),
	`reward_points` int NOT NULL DEFAULT 0,
	`rewarded_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `referral_claims_id` PRIMARY KEY(`id`),
	CONSTRAINT `referral_claims_tenant_guild_referred_email_uq` UNIQUE(`tenant_id`,`guild_id`,`referred_email_normalized`)
);
--> statement-breakpoint
ALTER TABLE `guild_configs` ADD `referral_reward_minor` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `guild_configs` ADD `referral_log_channel_id` varchar(32);--> statement-breakpoint
ALTER TABLE `guild_configs` ADD `referral_thank_you_template` text DEFAULT ('Thanks for your referral. You earned {points} point(s) ({amount_gbp} GBP) after {referred_email} paid.') NOT NULL;--> statement-breakpoint
ALTER TABLE `order_sessions` ADD `referral_reward_minor_snapshot` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `first_paid_orders_tenant_guild_idx` ON `customer_first_paid_orders` (`tenant_id`,`guild_id`);--> statement-breakpoint
CREATE INDEX `first_paid_orders_tenant_created_idx` ON `customer_first_paid_orders` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `referral_claims_tenant_guild_idx` ON `referral_claims` (`tenant_id`,`guild_id`);--> statement-breakpoint
CREATE INDEX `referral_claims_tenant_created_idx` ON `referral_claims` (`tenant_id`,`created_at`);