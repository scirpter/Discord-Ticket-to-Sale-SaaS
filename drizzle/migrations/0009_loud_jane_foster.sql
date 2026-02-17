ALTER TABLE `discount_coupons` ADD `allowed_product_ids` json DEFAULT ('[]') NOT NULL;--> statement-breakpoint
ALTER TABLE `discount_coupons` ADD `allowed_variant_ids` json DEFAULT ('[]') NOT NULL;