ALTER TABLE `order_notes_cache` MODIFY COLUMN `woo_order_id` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `orders_paid` MODIFY COLUMN `woo_order_id` varchar(128) NOT NULL;