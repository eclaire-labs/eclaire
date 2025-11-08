CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`id_token` text,
	`password_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `accounts_user_id_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_provider_id_account_id_unique` ON `accounts` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`key_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`hash_version` integer DEFAULT 1 NOT NULL,
	`key_suffix` text NOT NULL,
	`name` text NOT NULL,
	`user_id` text NOT NULL,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_id_unique` ON `api_keys` (`key_id`);--> statement-breakpoint
CREATE INDEX `api_keys_user_id_idx` ON `api_keys` (`user_id`);--> statement-breakpoint
CREATE TABLE `asset_processing_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_type` text NOT NULL,
	`asset_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`stages` text,
	`current_stage` text,
	`overall_progress` integer DEFAULT 0,
	`error_message` text,
	`error_details` text,
	`retry_count` integer DEFAULT 0,
	`max_retries` integer DEFAULT 3,
	`next_retry_at` integer,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`job_data` text,
	`locked_by` text,
	`locked_at` integer,
	`expires_at` integer,
	`scheduled_for` integer,
	`priority` integer DEFAULT 0,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `asset_jobs_status_retry_idx` ON `asset_processing_jobs` (`status`,`next_retry_at`);--> statement-breakpoint
CREATE INDEX `asset_jobs_queue_poll_idx` ON `asset_processing_jobs` (`status`,`scheduled_for`,`priority`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_processing_jobs_asset_type_asset_id_unique` ON `asset_processing_jobs` (`asset_type`,`asset_id`);--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`original_url` text NOT NULL,
	`normalized_url` text,
	`title` text,
	`description` text,
	`author` text,
	`lang` text,
	`due_date` integer,
	`page_last_updated_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`content_type` text,
	`etag` text,
	`last_modified` text,
	`raw_metadata` text,
	`user_agent` text,
	`favicon_storage_id` text,
	`thumbnail_storage_id` text,
	`screenshot_desktop_storage_id` text,
	`screenshot_mobile_storage_id` text,
	`screenshot_full_page_storage_id` text,
	`pdf_storage_id` text,
	`readable_html_storage_id` text,
	`extracted_md_storage_id` text,
	`extracted_txt_storage_id` text,
	`raw_html_storage_id` text,
	`readme_storage_id` text,
	`extracted_text` text,
	`enabled` integer DEFAULT true NOT NULL,
	`review_status` text,
	`flag_color` text,
	`is_pinned` integer DEFAULT false,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmarks_user_id_idx` ON `bookmarks` (`user_id`);--> statement-breakpoint
CREATE INDEX `bookmarks_is_pinned_idx` ON `bookmarks` (`is_pinned`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_id_normalized_url_idx` ON `bookmarks` (`user_id`,`normalized_url`);--> statement-breakpoint
CREATE TABLE `bookmarks_tags` (
	`bookmark_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`bookmark_id`, `tag_id`),
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text(255) NOT NULL,
	`platform` text NOT NULL,
	`capability` text NOT NULL,
	`config` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `channels_user_id_idx` ON `channels` (`user_id`);--> statement-breakpoint
CREATE INDEX `channels_platform_idx` ON `channels` (`platform`);--> statement-breakpoint
CREATE INDEX `channels_is_active_idx` ON `channels` (`is_active`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_message_at` integer,
	`message_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversations_user_id_idx` ON `conversations` (`user_id`);--> statement-breakpoint
CREATE INDEX `conversations_last_message_at_idx` ON `conversations` (`last_message_at`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`original_filename` text,
	`due_date` integer,
	`storage_id` text,
	`mime_type` text,
	`file_size` integer,
	`thumbnail_storage_id` text,
	`screenshot_storage_id` text,
	`pdf_storage_id` text,
	`raw_metadata` text,
	`original_mime_type` text,
	`user_agent` text,
	`enabled` integer DEFAULT true NOT NULL,
	`extracted_md_storage_id` text,
	`extracted_txt_storage_id` text,
	`extracted_text` text,
	`review_status` text,
	`flag_color` text,
	`is_pinned` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `documents_user_id_idx` ON `documents` (`user_id`);--> statement-breakpoint
CREATE INDEX `documents_is_pinned_idx` ON `documents` (`is_pinned`);--> statement-breakpoint
CREATE TABLE `documents_tags` (
	`document_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`document_id`, `tag_id`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`description` text NOT NULL,
	`sentiment` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `feedback_user_id_idx` ON `feedback` (`user_id`);--> statement-breakpoint
CREATE INDEX `feedback_created_at_idx` ON `feedback` (`created_at`);--> statement-breakpoint
CREATE TABLE `history` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`item_type` text NOT NULL,
	`item_id` text NOT NULL,
	`item_name` text,
	`before_data` text,
	`after_data` text,
	`actor` text NOT NULL,
	`metadata` text,
	`timestamp` integer NOT NULL,
	`user_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `history_item_idx` ON `history` (`item_type`,`item_id`);--> statement-breakpoint
CREATE INDEX `history_user_id_idx` ON `history` (`user_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`thinking_content` text,
	`created_at` integer NOT NULL,
	`metadata` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_id_idx` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `messages_created_at_idx` ON `messages` (`created_at`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`description` text,
	`raw_metadata` text,
	`original_mime_type` text,
	`user_agent` text,
	`enabled` integer DEFAULT true NOT NULL,
	`due_date` integer,
	`review_status` text,
	`flag_color` text,
	`is_pinned` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_user_id_idx` ON `notes` (`user_id`);--> statement-breakpoint
CREATE INDEX `notes_is_pinned_idx` ON `notes` (`is_pinned`);--> statement-breakpoint
CREATE TABLE `notes_tags` (
	`note_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`note_id`, `tag_id`),
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`original_filename` text,
	`storage_id` text NOT NULL,
	`mime_type` text,
	`file_size` integer,
	`device_id` text,
	`due_date` integer,
	`date_taken` integer,
	`camera_make` text,
	`camera_model` text,
	`lens_model` text,
	`iso` integer,
	`f_number` text,
	`exposure_time` text,
	`orientation` integer,
	`image_width` integer,
	`image_height` integer,
	`latitude` text,
	`longitude` text,
	`altitude` text,
	`location_city` text,
	`location_country_iso2` text,
	`location_country_name` text,
	`photo_type` text,
	`ocr_text` text,
	`dominant_colors` text,
	`thumbnail_storage_id` text,
	`screenshot_storage_id` text,
	`converted_jpg_storage_id` text,
	`raw_metadata` text,
	`original_mime_type` text,
	`user_agent` text,
	`enabled` integer DEFAULT true NOT NULL,
	`review_status` text,
	`flag_color` text,
	`is_pinned` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photos_user_id_idx` ON `photos` (`user_id`);--> statement-breakpoint
CREATE INDEX `photos_is_pinned_idx` ON `photos` (`is_pinned`);--> statement-breakpoint
CREATE INDEX `photos_date_taken_idx` ON `photos` (`date_taken`);--> statement-breakpoint
CREATE TABLE `photos_tags` (
	`photo_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`photo_id`, `tag_id`),
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_user_id_name_unique` ON `tags` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `task_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_comments_task_id_idx` ON `task_comments` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_comments_user_id_idx` ON `task_comments` (`user_id`);--> statement-breakpoint
CREATE INDEX `task_comments_created_at_idx` ON `task_comments` (`created_at`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'not-started' NOT NULL,
	`due_date` integer,
	`assigned_to_id` text,
	`enabled` integer DEFAULT true NOT NULL,
	`review_status` text,
	`flag_color` text,
	`is_pinned` integer DEFAULT false NOT NULL,
	`is_recurring` integer DEFAULT false NOT NULL,
	`cron_expression` text,
	`recurrence_end_date` integer,
	`recurrence_limit` integer,
	`run_immediately` integer DEFAULT false NOT NULL,
	`next_run_at` integer,
	`last_run_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_to_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tasks_user_id_idx` ON `tasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_due_date_idx` ON `tasks` (`due_date`);--> statement-breakpoint
CREATE INDEX `tasks_is_pinned_idx` ON `tasks` (`is_pinned`);--> statement-breakpoint
CREATE INDEX `tasks_is_recurring_idx` ON `tasks` (`is_recurring`);--> statement-breakpoint
CREATE INDEX `tasks_next_run_at_idx` ON `tasks` (`next_run_at`);--> statement-breakpoint
CREATE INDEX `tasks_last_run_at_idx` ON `tasks` (`last_run_at`);--> statement-breakpoint
CREATE INDEX `tasks_completed_at_idx` ON `tasks` (`completed_at`);--> statement-breakpoint
CREATE TABLE `tasks_tags` (
	`task_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `tag_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`user_type` text NOT NULL,
	`display_name` text,
	`full_name` text,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`avatar_storage_id` text,
	`avatar_color` text,
	`bio` text,
	`time_zone` text,
	`city` text,
	`country` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verifications_token_unique` ON `verifications` (`token`);