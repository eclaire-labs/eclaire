PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_accounts` (
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
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("id", "user_id", "account_id", "provider_id", "access_token", "refresh_token", "access_token_expires_at", "refresh_token_expires_at", "scope", "id_token", "password_hash", "created_at", "updated_at") SELECT "id", "user_id", "account_id", "provider_id", "access_token", "refresh_token", "access_token_expires_at", "refresh_token_expires_at", "scope", "id_token", "password_hash", "created_at", "updated_at" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `accounts_user_id_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_provider_id_account_id_unique` ON `accounts` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `__new_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`key_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`hash_version` integer DEFAULT 1 NOT NULL,
	`key_suffix` text NOT NULL,
	`name` text NOT NULL,
	`user_id` text NOT NULL,
	`last_used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_api_keys`("id", "key_id", "key_hash", "hash_version", "key_suffix", "name", "user_id", "last_used_at", "created_at", "is_active") SELECT "id", "key_id", "key_hash", "hash_version", "key_suffix", "name", "user_id", "last_used_at", "created_at", "is_active" FROM `api_keys`;--> statement-breakpoint
DROP TABLE `api_keys`;--> statement-breakpoint
ALTER TABLE `__new_api_keys` RENAME TO `api_keys`;--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_id_unique` ON `api_keys` (`key_id`);--> statement-breakpoint
CREATE INDEX `api_keys_user_id_idx` ON `api_keys` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_asset_processing_jobs` (
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
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`job_data` text,
	`locked_by` text,
	`locked_at` integer,
	`expires_at` integer,
	`scheduled_for` integer,
	`priority` integer DEFAULT 0,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_asset_processing_jobs`("id", "asset_type", "asset_id", "user_id", "status", "stages", "current_stage", "overall_progress", "error_message", "error_details", "retry_count", "max_retries", "next_retry_at", "started_at", "completed_at", "created_at", "updated_at", "job_data", "locked_by", "locked_at", "expires_at", "scheduled_for", "priority") SELECT "id", "asset_type", "asset_id", "user_id", "status", "stages", "current_stage", "overall_progress", "error_message", "error_details", "retry_count", "max_retries", "next_retry_at", "started_at", "completed_at", "created_at", "updated_at", "job_data", "locked_by", "locked_at", "expires_at", "scheduled_for", "priority" FROM `asset_processing_jobs`;--> statement-breakpoint
DROP TABLE `asset_processing_jobs`;--> statement-breakpoint
ALTER TABLE `__new_asset_processing_jobs` RENAME TO `asset_processing_jobs`;--> statement-breakpoint
CREATE INDEX `asset_jobs_status_retry_idx` ON `asset_processing_jobs` (`status`,`next_retry_at`);--> statement-breakpoint
CREATE INDEX `asset_jobs_queue_poll_idx` ON `asset_processing_jobs` (`status`,`scheduled_for`,`priority`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_processing_jobs_asset_type_asset_id_unique` ON `asset_processing_jobs` (`asset_type`,`asset_id`);--> statement-breakpoint
CREATE TABLE `__new_bookmarks` (
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
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
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
INSERT INTO `__new_bookmarks`("id", "user_id", "original_url", "normalized_url", "title", "description", "author", "lang", "due_date", "page_last_updated_at", "created_at", "updated_at", "content_type", "etag", "last_modified", "raw_metadata", "user_agent", "favicon_storage_id", "thumbnail_storage_id", "screenshot_desktop_storage_id", "screenshot_mobile_storage_id", "screenshot_full_page_storage_id", "pdf_storage_id", "readable_html_storage_id", "extracted_md_storage_id", "extracted_txt_storage_id", "raw_html_storage_id", "readme_storage_id", "extracted_text", "enabled", "review_status", "flag_color", "is_pinned") SELECT "id", "user_id", "original_url", "normalized_url", "title", "description", "author", "lang", "due_date", "page_last_updated_at", "created_at", "updated_at", "content_type", "etag", "last_modified", "raw_metadata", "user_agent", "favicon_storage_id", "thumbnail_storage_id", "screenshot_desktop_storage_id", "screenshot_mobile_storage_id", "screenshot_full_page_storage_id", "pdf_storage_id", "readable_html_storage_id", "extracted_md_storage_id", "extracted_txt_storage_id", "raw_html_storage_id", "readme_storage_id", "extracted_text", "enabled", "review_status", "flag_color", "is_pinned" FROM `bookmarks`;--> statement-breakpoint
DROP TABLE `bookmarks`;--> statement-breakpoint
ALTER TABLE `__new_bookmarks` RENAME TO `bookmarks`;--> statement-breakpoint
CREATE INDEX `bookmarks_user_id_idx` ON `bookmarks` (`user_id`);--> statement-breakpoint
CREATE INDEX `bookmarks_is_pinned_idx` ON `bookmarks` (`is_pinned`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_id_normalized_url_idx` ON `bookmarks` (`user_id`,`normalized_url`);--> statement-breakpoint
CREATE TABLE `__new_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text(255) NOT NULL,
	`platform` text NOT NULL,
	`capability` text NOT NULL,
	`config` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_channels`("id", "user_id", "name", "platform", "capability", "config", "is_active", "created_at", "updated_at") SELECT "id", "user_id", "name", "platform", "capability", "config", "is_active", "created_at", "updated_at" FROM `channels`;--> statement-breakpoint
DROP TABLE `channels`;--> statement-breakpoint
ALTER TABLE `__new_channels` RENAME TO `channels`;--> statement-breakpoint
CREATE INDEX `channels_user_id_idx` ON `channels` (`user_id`);--> statement-breakpoint
CREATE INDEX `channels_platform_idx` ON `channels` (`platform`);--> statement-breakpoint
CREATE INDEX `channels_is_active_idx` ON `channels` (`is_active`);--> statement-breakpoint
CREATE TABLE `__new_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_message_at` integer,
	`message_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_conversations`("id", "user_id", "title", "created_at", "updated_at", "last_message_at", "message_count") SELECT "id", "user_id", "title", "created_at", "updated_at", "last_message_at", "message_count" FROM `conversations`;--> statement-breakpoint
DROP TABLE `conversations`;--> statement-breakpoint
ALTER TABLE `__new_conversations` RENAME TO `conversations`;--> statement-breakpoint
CREATE INDEX `conversations_user_id_idx` ON `conversations` (`user_id`);--> statement-breakpoint
CREATE INDEX `conversations_last_message_at_idx` ON `conversations` (`last_message_at`);--> statement-breakpoint
CREATE TABLE `__new_documents` (
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
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_documents`("id", "user_id", "title", "description", "original_filename", "due_date", "storage_id", "mime_type", "file_size", "thumbnail_storage_id", "screenshot_storage_id", "pdf_storage_id", "raw_metadata", "original_mime_type", "user_agent", "enabled", "extracted_md_storage_id", "extracted_txt_storage_id", "extracted_text", "review_status", "flag_color", "is_pinned", "created_at", "updated_at") SELECT "id", "user_id", "title", "description", "original_filename", "due_date", "storage_id", "mime_type", "file_size", "thumbnail_storage_id", "screenshot_storage_id", "pdf_storage_id", "raw_metadata", "original_mime_type", "user_agent", "enabled", "extracted_md_storage_id", "extracted_txt_storage_id", "extracted_text", "review_status", "flag_color", "is_pinned", "created_at", "updated_at" FROM `documents`;--> statement-breakpoint
DROP TABLE `documents`;--> statement-breakpoint
ALTER TABLE `__new_documents` RENAME TO `documents`;--> statement-breakpoint
CREATE INDEX `documents_user_id_idx` ON `documents` (`user_id`);--> statement-breakpoint
CREATE INDEX `documents_is_pinned_idx` ON `documents` (`is_pinned`);--> statement-breakpoint
CREATE TABLE `__new_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`description` text NOT NULL,
	`sentiment` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_feedback`("id", "user_id", "description", "sentiment", "created_at", "updated_at") SELECT "id", "user_id", "description", "sentiment", "created_at", "updated_at" FROM `feedback`;--> statement-breakpoint
DROP TABLE `feedback`;--> statement-breakpoint
ALTER TABLE `__new_feedback` RENAME TO `feedback`;--> statement-breakpoint
CREATE INDEX `feedback_user_id_idx` ON `feedback` (`user_id`);--> statement-breakpoint
CREATE INDEX `feedback_created_at_idx` ON `feedback` (`created_at`);--> statement-breakpoint
CREATE TABLE `__new_history` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`item_type` text NOT NULL,
	`item_id` text NOT NULL,
	`item_name` text,
	`before_data` text,
	`after_data` text,
	`actor` text NOT NULL,
	`metadata` text,
	`timestamp` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`user_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_history`("id", "action", "item_type", "item_id", "item_name", "before_data", "after_data", "actor", "metadata", "timestamp", "user_id") SELECT "id", "action", "item_type", "item_id", "item_name", "before_data", "after_data", "actor", "metadata", "timestamp", "user_id" FROM `history`;--> statement-breakpoint
DROP TABLE `history`;--> statement-breakpoint
ALTER TABLE `__new_history` RENAME TO `history`;--> statement-breakpoint
CREATE INDEX `history_item_idx` ON `history` (`item_type`,`item_id`);--> statement-breakpoint
CREATE INDEX `history_user_id_idx` ON `history` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`thinking_content` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`metadata` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_messages`("id", "conversation_id", "role", "content", "thinking_content", "created_at", "metadata") SELECT "id", "conversation_id", "role", "content", "thinking_content", "created_at", "metadata" FROM `messages`;--> statement-breakpoint
DROP TABLE `messages`;--> statement-breakpoint
ALTER TABLE `__new_messages` RENAME TO `messages`;--> statement-breakpoint
CREATE INDEX `messages_conversation_id_idx` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `messages_created_at_idx` ON `messages` (`created_at`);--> statement-breakpoint
CREATE TABLE `__new_notes` (
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
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_notes`("id", "user_id", "title", "content", "description", "raw_metadata", "original_mime_type", "user_agent", "enabled", "due_date", "review_status", "flag_color", "is_pinned", "created_at", "updated_at") SELECT "id", "user_id", "title", "content", "description", "raw_metadata", "original_mime_type", "user_agent", "enabled", "due_date", "review_status", "flag_color", "is_pinned", "created_at", "updated_at" FROM `notes`;--> statement-breakpoint
DROP TABLE `notes`;--> statement-breakpoint
ALTER TABLE `__new_notes` RENAME TO `notes`;--> statement-breakpoint
CREATE INDEX `notes_user_id_idx` ON `notes` (`user_id`);--> statement-breakpoint
CREATE INDEX `notes_is_pinned_idx` ON `notes` (`is_pinned`);--> statement-breakpoint
CREATE TABLE `__new_photos` (
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
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_photos`("id", "user_id", "title", "description", "original_filename", "storage_id", "mime_type", "file_size", "device_id", "due_date", "date_taken", "camera_make", "camera_model", "lens_model", "iso", "f_number", "exposure_time", "orientation", "image_width", "image_height", "latitude", "longitude", "altitude", "location_city", "location_country_iso2", "location_country_name", "photo_type", "ocr_text", "dominant_colors", "thumbnail_storage_id", "screenshot_storage_id", "converted_jpg_storage_id", "raw_metadata", "original_mime_type", "user_agent", "enabled", "review_status", "flag_color", "is_pinned", "created_at", "updated_at") SELECT "id", "user_id", "title", "description", "original_filename", "storage_id", "mime_type", "file_size", "device_id", "due_date", "date_taken", "camera_make", "camera_model", "lens_model", "iso", "f_number", "exposure_time", "orientation", "image_width", "image_height", "latitude", "longitude", "altitude", "location_city", "location_country_iso2", "location_country_name", "photo_type", "ocr_text", "dominant_colors", "thumbnail_storage_id", "screenshot_storage_id", "converted_jpg_storage_id", "raw_metadata", "original_mime_type", "user_agent", "enabled", "review_status", "flag_color", "is_pinned", "created_at", "updated_at" FROM `photos`;--> statement-breakpoint
DROP TABLE `photos`;--> statement-breakpoint
ALTER TABLE `__new_photos` RENAME TO `photos`;--> statement-breakpoint
CREATE INDEX `photos_user_id_idx` ON `photos` (`user_id`);--> statement-breakpoint
CREATE INDEX `photos_is_pinned_idx` ON `photos` (`is_pinned`);--> statement-breakpoint
CREATE INDEX `photos_date_taken_idx` ON `photos` (`date_taken`);--> statement-breakpoint
CREATE TABLE `__new_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sessions`("id", "user_id", "ip_address", "user_agent", "token", "created_at", "updated_at", "expires_at") SELECT "id", "user_id", "ip_address", "user_agent", "token", "created_at", "updated_at", "expires_at" FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_task_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_task_comments`("id", "task_id", "user_id", "content", "created_at", "updated_at") SELECT "id", "task_id", "user_id", "content", "created_at", "updated_at" FROM `task_comments`;--> statement-breakpoint
DROP TABLE `task_comments`;--> statement-breakpoint
ALTER TABLE `__new_task_comments` RENAME TO `task_comments`;--> statement-breakpoint
CREATE INDEX `task_comments_task_id_idx` ON `task_comments` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_comments_user_id_idx` ON `task_comments` (`user_id`);--> statement-breakpoint
CREATE INDEX `task_comments_created_at_idx` ON `task_comments` (`created_at`);--> statement-breakpoint
CREATE TABLE `__new_tasks` (
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
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_to_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "user_id", "title", "description", "status", "due_date", "assigned_to_id", "enabled", "review_status", "flag_color", "is_pinned", "is_recurring", "cron_expression", "recurrence_end_date", "recurrence_limit", "run_immediately", "next_run_at", "last_run_at", "completed_at", "created_at", "updated_at") SELECT "id", "user_id", "title", "description", "status", "due_date", "assigned_to_id", "enabled", "review_status", "flag_color", "is_pinned", "is_recurring", "cron_expression", "recurrence_end_date", "recurrence_limit", "run_immediately", "next_run_at", "last_run_at", "completed_at", "created_at", "updated_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
CREATE INDEX `tasks_user_id_idx` ON `tasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_due_date_idx` ON `tasks` (`due_date`);--> statement-breakpoint
CREATE INDEX `tasks_is_pinned_idx` ON `tasks` (`is_pinned`);--> statement-breakpoint
CREATE INDEX `tasks_is_recurring_idx` ON `tasks` (`is_recurring`);--> statement-breakpoint
CREATE INDEX `tasks_next_run_at_idx` ON `tasks` (`next_run_at`);--> statement-breakpoint
CREATE INDEX `tasks_last_run_at_idx` ON `tasks` (`last_run_at`);--> statement-breakpoint
CREATE INDEX `tasks_completed_at_idx` ON `tasks` (`completed_at`);--> statement-breakpoint
CREATE TABLE `__new_users` (
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
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "user_type", "display_name", "full_name", "email", "email_verified", "avatar_storage_id", "avatar_color", "bio", "time_zone", "city", "country", "created_at", "updated_at") SELECT "id", "user_type", "display_name", "full_name", "email", "email_verified", "avatar_storage_id", "avatar_color", "bio", "time_zone", "city", "country", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `__new_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_verifications`("id", "identifier", "token", "created_at", "updated_at", "expires_at") SELECT "id", "identifier", "token", "created_at", "updated_at", "expires_at" FROM `verifications`;--> statement-breakpoint
DROP TABLE `verifications`;--> statement-breakpoint
ALTER TABLE `__new_verifications` RENAME TO `verifications`;--> statement-breakpoint
CREATE UNIQUE INDEX `verifications_token_unique` ON `verifications` (`token`);