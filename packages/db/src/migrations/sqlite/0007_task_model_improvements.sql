-- Add sort_order, parent_id columns to tasks
ALTER TABLE `tasks` ADD `sort_order` real;--> statement-breakpoint
ALTER TABLE `tasks` ADD `parent_id` text REFERENCES tasks(id) ON DELETE CASCADE;--> statement-breakpoint

-- Rename enabled -> processing_enabled across all content tables
ALTER TABLE `tasks` RENAME COLUMN `enabled` TO `processing_enabled`;--> statement-breakpoint
ALTER TABLE `bookmarks` RENAME COLUMN `enabled` TO `processing_enabled`;--> statement-breakpoint
ALTER TABLE `documents` RENAME COLUMN `enabled` TO `processing_enabled`;--> statement-breakpoint
ALTER TABLE `photos` RENAME COLUMN `enabled` TO `processing_enabled`;--> statement-breakpoint
ALTER TABLE `notes` RENAME COLUMN `enabled` TO `processing_enabled`;--> statement-breakpoint

-- New task indexes
CREATE INDEX `tasks_parent_id_idx` ON `tasks` (`parent_id`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_priority_created_at_idx` ON `tasks` (`user_id`,`priority`,`created_at`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_sort_order_idx` ON `tasks` (`user_id`,`sort_order`);
