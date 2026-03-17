CREATE TABLE `agent_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`step_number` integer NOT NULL,
	`timestamp` integer NOT NULL,
	`thinking_content` text,
	`text_content` text,
	`is_terminal` integer DEFAULT false NOT NULL,
	`stop_reason` text,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`tool_executions` text,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_steps_message_id_idx` ON `agent_steps` (`message_id`);--> statement-breakpoint
CREATE INDEX `agent_steps_conversation_id_idx` ON `agent_steps` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `agent_steps_conversation_id_step_number_idx` ON `agent_steps` (`conversation_id`,`step_number`);--> statement-breakpoint
ALTER TABLE `history` ADD `conversation_id` text REFERENCES conversations(id);--> statement-breakpoint
ALTER TABLE `history` ADD `message_id` text REFERENCES messages(id);--> statement-breakpoint
CREATE INDEX `history_conversation_id_idx` ON `history` (`conversation_id`);