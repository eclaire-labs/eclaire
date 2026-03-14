PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`agent_actor_id` text NOT NULL,
	`title` text,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`last_message_at` integer,
	`message_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_conversations`("id", "user_id", "agent_actor_id", "title", "created_at", "updated_at", "last_message_at", "message_count") SELECT "id", "user_id", "agent_actor_id", "title", "created_at", "updated_at", "last_message_at", "message_count" FROM `conversations`;--> statement-breakpoint
DROP TABLE `conversations`;--> statement-breakpoint
ALTER TABLE `__new_conversations` RENAME TO `conversations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `conversations_user_id_idx` ON `conversations` (`user_id`);--> statement-breakpoint
CREATE INDEX `conversations_user_id_agent_actor_id_idx` ON `conversations` (`user_id`,`agent_actor_id`);--> statement-breakpoint
CREATE INDEX `conversations_last_message_at_idx` ON `conversations` (`last_message_at`);