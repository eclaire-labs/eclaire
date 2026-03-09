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
CREATE INDEX `tasks_user_id_created_at_idx` ON `tasks` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_due_date_idx` ON `tasks` (`user_id`,`due_date`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_status_created_at_idx` ON `tasks` (`user_id`,`status`,`created_at`);