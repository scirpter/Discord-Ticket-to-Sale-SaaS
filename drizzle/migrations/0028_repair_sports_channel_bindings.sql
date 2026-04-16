SET @schema_name = DATABASE();
--> statement-breakpoint
SET @dedupe_bindings_sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = @schema_name
        AND table_name = 'sports_channel_bindings'
    ),
    'DELETE duplicate_binding
     FROM `sports_channel_bindings` duplicate_binding
     INNER JOIN (
       SELECT id
       FROM (
         SELECT
           id,
           ROW_NUMBER() OVER (
             PARTITION BY guild_id, sport_name
             ORDER BY created_at ASC, updated_at ASC, id ASC
           ) AS row_num
         FROM `sports_channel_bindings`
       ) ranked_bindings
       WHERE ranked_bindings.row_num > 1
     ) duplicates ON duplicates.id = duplicate_binding.id',
    'SELECT 1'
  )
);
--> statement-breakpoint
PREPARE dedupe_bindings_stmt FROM @dedupe_bindings_sql;
--> statement-breakpoint
EXECUTE dedupe_bindings_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE dedupe_bindings_stmt;
--> statement-breakpoint
SET @drop_profile_sport_unique_sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = @schema_name
        AND table_name = 'sports_channel_bindings'
        AND index_name = 'sports_channel_bindings_profile_sport_uq'
    ),
    'ALTER TABLE `sports_channel_bindings` DROP INDEX `sports_channel_bindings_profile_sport_uq`',
    'SELECT 1'
  )
);
--> statement-breakpoint
PREPARE drop_profile_sport_unique_stmt FROM @drop_profile_sport_unique_sql;
--> statement-breakpoint
EXECUTE drop_profile_sport_unique_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE drop_profile_sport_unique_stmt;
--> statement-breakpoint
SET @drop_profile_idx_sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = @schema_name
        AND table_name = 'sports_channel_bindings'
        AND index_name = 'sports_channel_bindings_profile_idx'
    ),
    'ALTER TABLE `sports_channel_bindings` DROP INDEX `sports_channel_bindings_profile_idx`',
    'SELECT 1'
  )
);
--> statement-breakpoint
PREPARE drop_profile_idx_stmt FROM @drop_profile_idx_sql;
--> statement-breakpoint
EXECUTE drop_profile_idx_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE drop_profile_idx_stmt;
--> statement-breakpoint
SET @add_guild_sport_unique_sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = @schema_name
        AND table_name = 'sports_channel_bindings'
    ) AND NOT EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = @schema_name
        AND table_name = 'sports_channel_bindings'
        AND index_name = 'sports_channel_bindings_guild_sport_uq'
    ),
    'ALTER TABLE `sports_channel_bindings` ADD CONSTRAINT `sports_channel_bindings_guild_sport_uq` UNIQUE(`guild_id`,`sport_name`)',
    'SELECT 1'
  )
);
--> statement-breakpoint
PREPARE add_guild_sport_unique_stmt FROM @add_guild_sport_unique_sql;
--> statement-breakpoint
EXECUTE add_guild_sport_unique_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE add_guild_sport_unique_stmt;
--> statement-breakpoint
SET @drop_profile_id_column_sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = @schema_name
        AND table_name = 'sports_channel_bindings'
        AND column_name = 'profile_id'
    ),
    'ALTER TABLE `sports_channel_bindings` DROP COLUMN `profile_id`',
    'SELECT 1'
  )
);
--> statement-breakpoint
PREPARE drop_profile_id_column_stmt FROM @drop_profile_id_column_sql;
--> statement-breakpoint
EXECUTE drop_profile_id_column_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE drop_profile_id_column_stmt;
