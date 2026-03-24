CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`original_filename` text,
	`storage_id` text NOT NULL,
	`mime_type` text,
	`file_size` integer,
	`due_date` integer,
	`media_type` text NOT NULL,
	`duration` real,
	`channels` integer,
	`sample_rate` integer,
	`bitrate` integer,
	`codec` text,
	`language` text,
	`extracted_text` text,
	`thumbnail_storage_id` text,
	`waveform_storage_id` text,
	`extracted_md_storage_id` text,
	`extracted_txt_storage_id` text,
	`raw_metadata` text,
	`original_mime_type` text,
	`user_agent` text,
	`processing_enabled` integer DEFAULT true NOT NULL,
	`processing_status` text,
	`review_status` text,
	`flag_color` text,
	`is_pinned` integer DEFAULT false,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_user_id_idx` ON `media` (`user_id`);--> statement-breakpoint
CREATE INDEX `media_is_pinned_idx` ON `media` (`is_pinned`);--> statement-breakpoint
CREATE INDEX `media_user_id_media_type_idx` ON `media` (`user_id`,`media_type`);--> statement-breakpoint
CREATE INDEX `media_user_id_created_at_idx` ON `media` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `media_user_id_title_idx` ON `media` (`user_id`,`title`);--> statement-breakpoint
CREATE TABLE `media_tags` (
	`media_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`media_id`, `tag_id`),
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_tags_tag_id_idx` ON `media_tags` (`tag_id`);