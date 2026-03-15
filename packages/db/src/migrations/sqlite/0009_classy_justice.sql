CREATE TABLE `task_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`schedule_key` text,
	`job_id` text,
	`status` text NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`duration_ms` integer,
	`error` text,
	`result_summary` text,
	`token_usage` text,
	`metadata` text,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_executions_task_id_created_at_idx` ON `task_executions` (`task_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `task_executions_user_id_created_at_idx` ON `task_executions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `task_executions_status_idx` ON `task_executions` (`status`);--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `processing_status` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `processing_status` text;--> statement-breakpoint
ALTER TABLE `notes` ADD `processing_status` text;--> statement-breakpoint
ALTER TABLE `photos` ADD `processing_status` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `processing_status` text;--> statement-breakpoint
ALTER TABLE `queue_schedules` ADD `timezone` text;