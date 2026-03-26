CREATE TABLE `scheduled_action_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`scheduled_action_id` text NOT NULL,
	`user_id` text NOT NULL,
	`scheduled_for` integer,
	`started_at` integer,
	`completed_at` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`output` text,
	`error` text,
	`delivery_result` text,
	`metadata` text,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`scheduled_action_id`) REFERENCES `scheduled_actions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sa_executions_action_id_created_at_idx` ON `scheduled_action_executions` (`scheduled_action_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `sa_executions_user_id_created_at_idx` ON `scheduled_action_executions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `sa_executions_status_idx` ON `scheduled_action_executions` (`status`);--> statement-breakpoint
CREATE TABLE `scheduled_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`title` text NOT NULL,
	`prompt` text NOT NULL,
	`trigger_type` text NOT NULL,
	`run_at` integer,
	`cron_expression` text,
	`timezone` text,
	`start_at` integer,
	`end_at` integer,
	`max_runs` integer,
	`run_count` integer DEFAULT 0 NOT NULL,
	`delivery_targets` text DEFAULT '[{"type":"notification_channels"}]' NOT NULL,
	`source_conversation_id` text,
	`agent_actor_id` text,
	`last_run_at` integer,
	`next_run_at` integer,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `scheduled_actions_user_id_status_idx` ON `scheduled_actions` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `scheduled_actions_user_id_next_run_at_idx` ON `scheduled_actions` (`user_id`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `scheduled_actions_status_next_run_at_idx` ON `scheduled_actions` (`status`,`next_run_at`);