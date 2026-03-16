CREATE TABLE `ai_model_selection` (
	`context` text PRIMARY KEY NOT NULL,
	`model_id` text NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`model_id`) REFERENCES `ai_models`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `ai_models` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider_id` text NOT NULL,
	`provider_model` text NOT NULL,
	`capabilities` text DEFAULT '{}' NOT NULL,
	`tokenizer` text,
	`source` text,
	`pricing` text,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`provider_id`) REFERENCES `ai_providers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_models_provider_id_idx` ON `ai_models` (`provider_id`);--> statement-breakpoint
CREATE TABLE `ai_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`dialect` text NOT NULL,
	`base_url` text,
	`auth` text DEFAULT '{"type":"none"}' NOT NULL,
	`headers` text,
	`engine` text,
	`overrides` text,
	`cli` text,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `instance_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`transport` text NOT NULL,
	`command` text,
	`args` text,
	`connect_timeout` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`tool_mode` text DEFAULT 'managed',
	`availability` text,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `users` ADD `is_instance_admin` integer DEFAULT false NOT NULL;