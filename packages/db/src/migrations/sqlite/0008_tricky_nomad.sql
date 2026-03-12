DROP INDEX `tags_user_id_name_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `tags_user_id_name_lower_idx` ON `tags` (`user_id`,lower("name"));