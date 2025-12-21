CREATE TABLE `queue_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`queue` text NOT NULL,
	`key` text,
	`data` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`scheduled_for` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`next_retry_at` integer,
	`backoff_ms` integer,
	`backoff_type` text,
	`locked_by` text,
	`locked_at` integer,
	`expires_at` integer,
	`lock_token` text,
	`error_message` text,
	`error_details` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`stages` text,
	`current_stage` text,
	`overall_progress` integer DEFAULT 0,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `queue_jobs_queue_key_idx` ON `queue_jobs` (`queue`,`key`);--> statement-breakpoint
CREATE INDEX `queue_jobs_queue_status_idx` ON `queue_jobs` (`queue`,`status`);--> statement-breakpoint
CREATE INDEX `queue_jobs_status_scheduled_idx` ON `queue_jobs` (`status`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `queue_jobs_status_retry_idx` ON `queue_jobs` (`status`,`next_retry_at`);--> statement-breakpoint
CREATE INDEX `queue_jobs_status_expires_idx` ON `queue_jobs` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `queue_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`queue` text NOT NULL,
	`key` text NOT NULL,
	`cron` text NOT NULL,
	`data` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_at` integer,
	`next_run_at` integer,
	`run_limit` integer,
	`run_count` integer DEFAULT 0 NOT NULL,
	`end_date` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `queue_schedules_key_unique` ON `queue_schedules` (`key`);--> statement-breakpoint
CREATE INDEX `queue_schedules_enabled_next_run_idx` ON `queue_schedules` (`enabled`,`next_run_at`);--> statement-breakpoint
DROP TABLE `asset_processing_jobs`;--> statement-breakpoint
DROP INDEX `tasks_is_recurring_idx`;--> statement-breakpoint
DROP INDEX `tasks_next_run_at_idx`;--> statement-breakpoint
DROP INDEX `tasks_last_run_at_idx`;--> statement-breakpoint
ALTER TABLE `tasks` ADD `last_executed_at` integer;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `is_recurring`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `cron_expression`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `recurrence_end_date`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `recurrence_limit`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `run_immediately`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `next_run_at`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `last_run_at`;