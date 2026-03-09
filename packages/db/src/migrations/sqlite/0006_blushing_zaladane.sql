ALTER TABLE `bookmarks` RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE `documents` RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE `notes` RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE `photos` RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE `tasks` RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
CREATE INDEX `bookmarks_user_id_created_at_idx` ON `bookmarks` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_id_title_idx` ON `bookmarks` (`user_id`,`title`);--> statement-breakpoint
CREATE INDEX `documents_user_id_created_at_idx` ON `documents` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `documents_user_id_title_idx` ON `documents` (`user_id`,`title`);--> statement-breakpoint
CREATE INDEX `documents_user_id_updated_at_idx` ON `documents` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `notes_user_id_created_at_idx` ON `notes` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notes_user_id_title_idx` ON `notes` (`user_id`,`title`);--> statement-breakpoint
CREATE INDEX `photos_user_id_created_at_idx` ON `photos` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `photos_user_id_date_taken_idx` ON `photos` (`user_id`,`date_taken`);--> statement-breakpoint
CREATE INDEX `photos_user_id_title_idx` ON `photos` (`user_id`,`title`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `priority` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `sort_order` real;--> statement-breakpoint
ALTER TABLE `tasks` ADD `parent_id` text REFERENCES tasks(id);--> statement-breakpoint
CREATE INDEX `tasks_parent_id_idx` ON `tasks` (`parent_id`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_created_at_idx` ON `tasks` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_due_date_idx` ON `tasks` (`user_id`,`due_date`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_status_created_at_idx` ON `tasks` (`user_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_priority_created_at_idx` ON `tasks` (`user_id`,`priority`,`created_at`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_sort_order_idx` ON `tasks` (`user_id`,`sort_order`);--> statement-breakpoint
DROP INDEX `users_email_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (lower("email"));