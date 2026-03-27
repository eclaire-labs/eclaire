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
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `accounts_user_id_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_provider_id_account_id_unique` ON `accounts` (`provider_id`,`account_id`);--> statement-breakpoint
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
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`system_prompt` text NOT NULL,
	`tool_names` text DEFAULT '[]' NOT NULL,
	`skill_names` text DEFAULT '[]' NOT NULL,
	`model_id` text,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agents_user_id_idx` ON `agents` (`user_id`);--> statement-breakpoint
CREATE INDEX `agents_user_id_updated_at_idx` ON `agents` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `agents_user_id_name_lower_idx` ON `agents` (`user_id`,lower("name"));--> statement-breakpoint
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
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`key_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`hash_version` integer DEFAULT 1 NOT NULL,
	`key_suffix` text NOT NULL,
	`name` text NOT NULL,
	`user_id` text NOT NULL,
	`last_used_at` integer,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_id_unique` ON `api_keys` (`key_id`);--> statement-breakpoint
CREATE INDEX `api_keys_user_id_idx` ON `api_keys` (`user_id`);--> statement-breakpoint
CREATE TABLE `_app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL
);
--> statement-breakpoint
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
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
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
	`processing_enabled` integer DEFAULT true NOT NULL,
	`processing_status` text,
	`review_status` text,
	`flag_color` text,
	`is_pinned` integer DEFAULT false,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmarks_user_id_idx` ON `bookmarks` (`user_id`);--> statement-breakpoint
CREATE INDEX `bookmarks_is_pinned_idx` ON `bookmarks` (`is_pinned`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_id_normalized_url_idx` ON `bookmarks` (`user_id`,`normalized_url`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_id_created_at_idx` ON `bookmarks` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_id_title_idx` ON `bookmarks` (`user_id`,`title`);--> statement-breakpoint
CREATE TABLE `bookmarks_tags` (
	`bookmark_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`bookmark_id`, `tag_id`),
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmarks_tags_tag_id_idx` ON `bookmarks_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`agent_actor_id` text,
	`name` text(255) NOT NULL,
	`platform` text NOT NULL,
	`capability` text NOT NULL,
	`config` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `channels_user_id_idx` ON `channels` (`user_id`);--> statement-breakpoint
CREATE INDEX `channels_agent_actor_id_idx` ON `channels` (`agent_actor_id`);--> statement-breakpoint
CREATE INDEX `channels_platform_idx` ON `channels` (`platform`);--> statement-breakpoint
CREATE INDEX `channels_is_active_idx` ON `channels` (`is_active`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`agent_actor_id` text NOT NULL,
	`title` text,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`last_message_at` integer,
	`message_count` integer DEFAULT 0 NOT NULL,
	`execution_status` text DEFAULT 'idle' NOT NULL,
	`has_unread_response` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversations_user_id_idx` ON `conversations` (`user_id`);--> statement-breakpoint
CREATE INDEX `conversations_user_id_agent_actor_id_idx` ON `conversations` (`user_id`,`agent_actor_id`);--> statement-breakpoint
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
	`processing_enabled` integer DEFAULT true NOT NULL,
	`processing_status` text,
	`extracted_md_storage_id` text,
	`extracted_txt_storage_id` text,
	`extracted_text` text,
	`review_status` text,
	`flag_color` text,
	`is_pinned` integer DEFAULT false,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `documents_user_id_idx` ON `documents` (`user_id`);--> statement-breakpoint
CREATE INDEX `documents_is_pinned_idx` ON `documents` (`is_pinned`);--> statement-breakpoint
CREATE INDEX `documents_user_id_created_at_idx` ON `documents` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `documents_user_id_title_idx` ON `documents` (`user_id`,`title`);--> statement-breakpoint
CREATE INDEX `documents_user_id_updated_at_idx` ON `documents` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `documents_tags` (
	`document_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`document_id`, `tag_id`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `documents_tags_tag_id_idx` ON `documents_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`description` text NOT NULL,
	`sentiment` text,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
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
	`actor_id` text,
	`authorized_by_actor_id` text,
	`grant_id` text,
	`metadata` text,
	`timestamp` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`user_id` text,
	`conversation_id` text,
	`message_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `history_item_idx` ON `history` (`item_type`,`item_id`);--> statement-breakpoint
CREATE INDEX `history_user_id_idx` ON `history` (`user_id`);--> statement-breakpoint
CREATE INDEX `history_actor_id_idx` ON `history` (`actor_id`);--> statement-breakpoint
CREATE INDEX `history_authorized_by_actor_id_idx` ON `history` (`authorized_by_actor_id`);--> statement-breakpoint
CREATE INDEX `history_grant_id_idx` ON `history` (`grant_id`);--> statement-breakpoint
CREATE INDEX `history_conversation_id_idx` ON `history` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `human_actors` (
	`actor_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `human_actors_user_id_idx` ON `human_actors` (`user_id`);--> statement-breakpoint
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
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`original_filename` text,
	`source_url` text,
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
	`width` integer,
	`height` integer,
	`frame_rate` real,
	`video_codec` text,
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
CREATE INDEX `media_tags_tag_id_idx` ON `media_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`author_actor_id` text,
	`content` text NOT NULL,
	`thinking_content` text,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`metadata` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_id_idx` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `messages_author_actor_id_idx` ON `messages` (`author_actor_id`);--> statement-breakpoint
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
	`processing_enabled` integer DEFAULT true NOT NULL,
	`processing_status` text,
	`due_date` integer,
	`review_status` text,
	`flag_color` text,
	`is_pinned` integer DEFAULT false,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_user_id_idx` ON `notes` (`user_id`);--> statement-breakpoint
CREATE INDEX `notes_is_pinned_idx` ON `notes` (`is_pinned`);--> statement-breakpoint
CREATE INDEX `notes_user_id_created_at_idx` ON `notes` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notes_user_id_title_idx` ON `notes` (`user_id`,`title`);--> statement-breakpoint
CREATE TABLE `notes_tags` (
	`note_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`note_id`, `tag_id`),
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_tags_tag_id_idx` ON `notes_tags` (`tag_id`);--> statement-breakpoint
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
	`f_number` real,
	`exposure_time` real,
	`orientation` integer,
	`image_width` integer,
	`image_height` integer,
	`latitude` real,
	`longitude` real,
	`altitude` real,
	`location_city` text,
	`location_country_iso2` text,
	`location_country_name` text,
	`photo_type` text,
	`extracted_text` text,
	`dominant_colors` text,
	`thumbnail_storage_id` text,
	`screenshot_storage_id` text,
	`converted_jpg_storage_id` text,
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
CREATE INDEX `photos_user_id_idx` ON `photos` (`user_id`);--> statement-breakpoint
CREATE INDEX `photos_is_pinned_idx` ON `photos` (`is_pinned`);--> statement-breakpoint
CREATE INDEX `photos_date_taken_idx` ON `photos` (`date_taken`);--> statement-breakpoint
CREATE INDEX `photos_user_id_created_at_idx` ON `photos` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `photos_user_id_date_taken_idx` ON `photos` (`user_id`,`date_taken`);--> statement-breakpoint
CREATE INDEX `photos_user_id_title_idx` ON `photos` (`user_id`,`title`);--> statement-breakpoint
CREATE TABLE `photos_tags` (
	`photo_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`photo_id`, `tag_id`),
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photos_tags_tag_id_idx` ON `photos_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
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
CREATE UNIQUE INDEX `tags_user_id_name_lower_idx` ON `tags` (`user_id`,lower("name"));--> statement-breakpoint
CREATE TABLE `task_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`author_actor_id` text,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_comments_task_id_idx` ON `task_comments` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_comments_user_id_idx` ON `task_comments` (`user_id`);--> statement-breakpoint
CREATE INDEX `task_comments_author_actor_id_idx` ON `task_comments` (`author_actor_id`);--> statement-breakpoint
CREATE INDEX `task_comments_created_at_idx` ON `task_comments` (`created_at`);--> statement-breakpoint
CREATE TABLE `task_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`scheduled_for` integer,
	`started_at` integer,
	`completed_at` integer,
	`duration_ms` integer,
	`execution_status` text DEFAULT 'idle' NOT NULL,
	`prompt` text,
	`result_summary` text,
	`result_body` text,
	`error_body` text,
	`requires_review` integer DEFAULT false NOT NULL,
	`occurrence_review_status` text DEFAULT 'none' NOT NULL,
	`executor_actor_id` text,
	`requested_by_actor_id` text,
	`token_usage` text,
	`delivery_result` text,
	`retry_of_occurrence_id` text,
	`metadata` text,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`executor_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`requested_by_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`retry_of_occurrence_id`) REFERENCES `task_occurrences`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `task_occurrences_task_id_created_at_idx` ON `task_occurrences` (`task_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `task_occurrences_user_id_created_at_idx` ON `task_occurrences` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `task_occurrences_execution_status_idx` ON `task_occurrences` (`execution_status`);--> statement-breakpoint
CREATE INDEX `task_occurrences_executor_actor_id_idx` ON `task_occurrences` (`executor_actor_id`);--> statement-breakpoint
CREATE INDEX `task_occurrences_kind_idx` ON `task_occurrences` (`kind`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`prompt` text,
	`delegate_actor_id` text,
	`delegate_mode` text DEFAULT 'manual' NOT NULL,
	`delegated_by_actor_id` text,
	`task_status` text DEFAULT 'open' NOT NULL,
	`attention_status` text DEFAULT 'none' NOT NULL,
	`review_status` text DEFAULT 'none' NOT NULL,
	`schedule_type` text DEFAULT 'none' NOT NULL,
	`schedule_rule` text,
	`schedule_summary` text,
	`timezone` text,
	`next_occurrence_at` integer,
	`max_occurrences` integer,
	`occurrence_count` integer DEFAULT 0 NOT NULL,
	`latest_execution_status` text,
	`latest_result_summary` text,
	`latest_error_summary` text,
	`delivery_targets` text,
	`source_conversation_id` text,
	`due_at` integer,
	`priority` integer DEFAULT 0 NOT NULL,
	`parent_id` text,
	`flag_color` text,
	`is_pinned` integer DEFAULT false NOT NULL,
	`sort_order` real,
	`processing_enabled` integer DEFAULT true NOT NULL,
	`processing_status` text,
	`completed_at` integer,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`delegate_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`delegated_by_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tasks_user_id_idx` ON `tasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `tasks_task_status_idx` ON `tasks` (`task_status`);--> statement-breakpoint
CREATE INDEX `tasks_attention_status_idx` ON `tasks` (`attention_status`);--> statement-breakpoint
CREATE INDEX `tasks_due_at_idx` ON `tasks` (`due_at`);--> statement-breakpoint
CREATE INDEX `tasks_delegate_actor_id_idx` ON `tasks` (`delegate_actor_id`);--> statement-breakpoint
CREATE INDEX `tasks_is_pinned_idx` ON `tasks` (`is_pinned`);--> statement-breakpoint
CREATE INDEX `tasks_completed_at_idx` ON `tasks` (`completed_at`);--> statement-breakpoint
CREATE INDEX `tasks_parent_id_idx` ON `tasks` (`parent_id`);--> statement-breakpoint
CREATE INDEX `tasks_schedule_type_idx` ON `tasks` (`schedule_type`);--> statement-breakpoint
CREATE INDEX `tasks_next_occurrence_at_idx` ON `tasks` (`next_occurrence_at`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_attention_status_idx` ON `tasks` (`user_id`,`attention_status`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_created_at_idx` ON `tasks` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_due_at_idx` ON `tasks` (`user_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_task_status_created_at_idx` ON `tasks` (`user_id`,`task_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_priority_created_at_idx` ON `tasks` (`user_id`,`priority`,`created_at`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_sort_order_idx` ON `tasks` (`user_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `tasks_tags` (
	`task_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `tag_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tasks_tags_tag_id_idx` ON `tasks_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`preferences` text DEFAULT '{}' NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
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
	`is_instance_admin` integer DEFAULT false NOT NULL,
	`account_status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (lower("email"));--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verifications_token_unique` ON `verifications` (`token`);--> statement-breakpoint
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
	`timezone` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `queue_schedules_key_unique` ON `queue_schedules` (`key`);--> statement-breakpoint
CREATE INDEX `queue_schedules_enabled_next_run_idx` ON `queue_schedules` (`enabled`,`next_run_at`);