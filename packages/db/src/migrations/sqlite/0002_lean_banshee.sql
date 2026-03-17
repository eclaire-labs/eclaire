ALTER TABLE `conversations` ADD `execution_status` text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `has_unread_response` integer DEFAULT false NOT NULL;