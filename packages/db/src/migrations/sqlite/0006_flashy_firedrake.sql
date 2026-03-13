ALTER TABLE `bookmarks` RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE `documents` RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE `notes` RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE `photos` RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
CREATE TABLE `actor_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`grant_id` text NOT NULL,
	`type` text DEFAULT 'api_key' NOT NULL,
	`key_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`hash_version` integer DEFAULT 1 NOT NULL,
	`key_suffix` text NOT NULL,
	`name` text NOT NULL,
	`last_used_at` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grant_id`) REFERENCES `actor_grants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `actor_credentials_key_id_unique` ON `actor_credentials` (`key_id`);--> statement-breakpoint
CREATE INDEX `actor_credentials_actor_id_idx` ON `actor_credentials` (`actor_id`);--> statement-breakpoint
CREATE INDEX `actor_credentials_owner_user_id_idx` ON `actor_credentials` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `actor_credentials_grant_id_idx` ON `actor_credentials` (`grant_id`);--> statement-breakpoint
CREATE TABLE `actor_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`granted_by_actor_id` text,
	`name` text NOT NULL,
	`scopes` text NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `actor_grants_actor_id_idx` ON `actor_grants` (`actor_id`);--> statement-breakpoint
CREATE INDEX `actor_grants_owner_user_id_idx` ON `actor_grants` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `actor_grants_granted_by_actor_id_idx` ON `actor_grants` (`granted_by_actor_id`);--> statement-breakpoint
CREATE TABLE `actors` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`kind` text NOT NULL,
	`display_name` text,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `actors_owner_user_id_idx` ON `actors` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `actors_owner_user_id_kind_idx` ON `actors` (`owner_user_id`,`kind`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`system_prompt` text NOT NULL,
	`tool_names` text DEFAULT '[]' NOT NULL,
	`skill_names` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agents_user_id_idx` ON `agents` (`user_id`);--> statement-breakpoint
CREATE INDEX `agents_user_id_updated_at_idx` ON `agents` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `agents_user_id_name_lower_idx` ON `agents` (`user_id`,lower("name"));--> statement-breakpoint
CREATE TABLE `human_actors` (
	`actor_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `human_actors_user_id_idx` ON `human_actors` (`user_id`);--> statement-breakpoint
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
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'not-started' NOT NULL,
	`due_date` integer,
	`assignee_actor_id` text,
	`priority` integer DEFAULT 0 NOT NULL,
	`processing_enabled` integer DEFAULT true NOT NULL,
	`review_status` text,
	`flag_color` text,
	`is_pinned` integer DEFAULT false NOT NULL,
	`sort_order` real,
	`parent_id` text,
	`last_executed_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "user_id", "title", "description", "status", "due_date", "assignee_actor_id", "priority", "processing_enabled", "review_status", "flag_color", "is_pinned", "sort_order", "parent_id", "last_executed_at", "completed_at", "created_at", "updated_at") SELECT "id", "user_id", "title", "description", "status", "due_date", "assignee_actor_id", "priority", "processing_enabled", "review_status", "flag_color", "is_pinned", "sort_order", "parent_id", "last_executed_at", "completed_at", "created_at", "updated_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `tasks_user_id_idx` ON `tasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_due_date_idx` ON `tasks` (`due_date`);--> statement-breakpoint
CREATE INDEX `tasks_assignee_actor_id_idx` ON `tasks` (`assignee_actor_id`);--> statement-breakpoint
CREATE INDEX `tasks_is_pinned_idx` ON `tasks` (`is_pinned`);--> statement-breakpoint
CREATE INDEX `tasks_completed_at_idx` ON `tasks` (`completed_at`);--> statement-breakpoint
CREATE INDEX `tasks_parent_id_idx` ON `tasks` (`parent_id`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_created_at_idx` ON `tasks` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_due_date_idx` ON `tasks` (`user_id`,`due_date`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_status_created_at_idx` ON `tasks` (`user_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_priority_created_at_idx` ON `tasks` (`user_id`,`priority`,`created_at`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_sort_order_idx` ON `tasks` (`user_id`,`sort_order`);--> statement-breakpoint
DROP INDEX `tags_user_id_name_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `tags_user_id_name_lower_idx` ON `tags` (`user_id`,lower("name"));--> statement-breakpoint
DROP INDEX `users_email_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (lower("email"));--> statement-breakpoint
ALTER TABLE `channels` ADD `agent_actor_id` text REFERENCES actors(id);--> statement-breakpoint
CREATE INDEX `channels_agent_actor_id_idx` ON `channels` (`agent_actor_id`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `agent_actor_id` text NOT NULL;--> statement-breakpoint
CREATE INDEX `conversations_user_id_agent_actor_id_idx` ON `conversations` (`user_id`,`agent_actor_id`);--> statement-breakpoint
ALTER TABLE `history` ADD `actor_id` text;--> statement-breakpoint
ALTER TABLE `history` ADD `authorized_by_actor_id` text;--> statement-breakpoint
ALTER TABLE `history` ADD `grant_id` text;--> statement-breakpoint
CREATE INDEX `history_actor_id_idx` ON `history` (`actor_id`);--> statement-breakpoint
CREATE INDEX `history_authorized_by_actor_id_idx` ON `history` (`authorized_by_actor_id`);--> statement-breakpoint
CREATE INDEX `history_grant_id_idx` ON `history` (`grant_id`);--> statement-breakpoint
ALTER TABLE `messages` ADD `author_actor_id` text;--> statement-breakpoint
CREATE INDEX `messages_author_actor_id_idx` ON `messages` (`author_actor_id`);--> statement-breakpoint
ALTER TABLE `task_comments` ADD `author_actor_id` text REFERENCES actors(id);--> statement-breakpoint
CREATE INDEX `task_comments_author_actor_id_idx` ON `task_comments` (`author_actor_id`);